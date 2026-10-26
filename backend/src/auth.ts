import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { AuthSession, PasskeyInfo } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";
import { BASE_PATH, resolveFromBase } from "./config.ts";
import { type CredentialStore, hashPassword, verifyPassword } from "./credentials.ts";
import { AuthError, createPasskeys } from "./passkeys.ts";

export const SESSION_COOKIE = "snapraid_session";

// Failed logins per client before it has to wait
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// Slows down guessing even below the lockout
const FAILED_LOGIN_DELAY_MS = 500;
export const MIN_PASSWORD_LENGTH = 12;

export interface AuthOptions {
  username: string;
  // From the environment; applies until the password is changed in the UI
  password: string;
  // Signs the session tokens together with the password, changing it logs everyone out
  secret: string;
  sessionTtlSeconds: number;
  // The password set in the UI and the passkeys (credentials.ts)
  store: CredentialStore;
  // After a new password: open connections that only checked the session when they opened, the
  // WebSocket, have to go too
  onPasswordChange?: () => void;
}

interface Attempts {
  count: number;
  resetAt: number;
}

const encoder = new TextEncoder();

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

// Compares digests instead of the strings, so the time taken leaks neither content nor length
export const safeEqual = async (a: string, b: string): Promise<boolean> => {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
};

// The address the connection came from, which Deno.serve passes as the env; not a header,
// which a client could set to escape the lockout. Behind a proxy that is the proxy's address
const clientKey = (c: Context): string => {
  const remote = (c.env as Partial<Deno.ServeHandlerInfo> | undefined)?.remoteAddr;
  return remote && "hostname" in remote ? remote.hostname : "local";
};

const isHttps = (c: Context): boolean =>
  c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";

export const createAuth = async (options: AuthOptions) => {
  const { store } = options;
  const attempts = new Map<string, Attempts>();
  const passkeys = createPasskeys(store, options.username);

  // The session key includes the password: a new one ends every session. With the password from
  // the environment it is the key of the versions before passwords could change in the UI
  const signingKey = async () =>
    `${options.secret}:${await sha256Hex(`${options.username}\0${store.passwordHash() ?? options.password}`)}`;
  let key = await signingKey();

  const checkPassword = async (password: string): Promise<boolean> => {
    const hash = store.passwordHash();
    return hash ? await verifyPassword(password, hash) : await safeEqual(password, options.password);
  };

  // The session's username and an id for it (a hash of its token), or null
  const readSession = async (c: Context): Promise<{ username: string; id: string } | null> => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return null;
    try {
      const payload = await verify(token, key, "HS256");
      return typeof payload.sub === "string" ? { username: payload.sub, id: await sha256Hex(token) } : null;
    } catch {
      return null;
    }
  };

  const startSession = async (c: Context) => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: options.username, iat: now, exp: now + options.sessionTtlSeconds },
      key,
      "HS256",
    );
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Strict",
      secure: isHttps(c),
      path: "/",
      maxAge: options.sessionTtlSeconds,
    });
  };

  const lockedUntil = (client: string): number | null => {
    const entry = attempts.get(client);
    if (!entry) return null;
    if (entry.resetAt <= Date.now()) {
      attempts.delete(client);
      return null;
    }
    return entry.count >= MAX_FAILED_ATTEMPTS ? entry.resetAt : null;
  };

  const recordFailure = (client: string): void => {
    const now = Date.now();
    const entry = attempts.get(client);
    if (!entry || entry.resetAt <= now) {
      attempts.set(client, { count: 1, resetAt: now + LOCKOUT_MS });
    } else {
      entry.count++;
    }
  };

  /**
   * Runs a password or passkey check under the lockout: the 429 response while the client is
   * locked out, otherwise the outcome, a failure counted and slowed down
   */
  const attempt = async (c: Context, check: () => Promise<boolean>): Promise<Response | boolean> => {
    const client = clientKey(c);
    const locked = lockedUntil(client);
    if (locked) {
      const retryAfter = Math.ceil((locked - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many attempts", retryAfter }, 429);
    }
    const ok = await check();
    if (!ok) {
      recordFailure(client);
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
      return false;
    }
    attempts.delete(client);
    return true;
  };

  // The routes below need a session themselves: the middleware lets /api/auth/* through
  const signedIn = (handler: (c: Context, session: { username: string; id: string }) => Promise<Response>) =>
  async (c: Context) => {
    const session = await readSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    try {
      return await handler(c, session);
    } catch (error) {
      if (error instanceof AuthError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  };

  const body = (c: Context): Promise<Record<string, unknown>> => c.req.json().catch(() => ({}));

  const routes = new Hono();

  routes.get("/session", async (c) => {
    const session = await readSession(c);
    return c.json<AuthSession>({
      enabled: true,
      authenticated: session !== null,
      ...(session ? { username: session.username } : {}),
      passkeys: passkeys.any(),
    });
  });

  routes.post("/login", async (c) => {
    const { username, password } = await body(c);
    // Both checks always run, so a wrong username takes as long as a wrong password
    const result = await attempt(c, async () => {
      const [userOk, passOk] = await Promise.all([
        safeEqual(typeof username === "string" ? username : "", options.username),
        checkPassword(typeof password === "string" ? password : ""),
      ]);
      return userOk && passOk;
    });
    if (result instanceof Response) return result;
    if (!result) return c.json({ error: "Invalid credentials" }, 401);
    await startSession(c);
    return c.json<AuthSession>({ enabled: true, authenticated: true, username: options.username });
  });

  routes.post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json<AuthSession>({ enabled: true, authenticated: false, passkeys: passkeys.any() });
  });

  // A new password, after the current one; ends every other session, this one gets a new cookie
  routes.post(
    "/password",
    signedIn(async (c) => {
      const { current, next } = await body(c);
      if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) {
        return c.json({ error: msg("server_error_password_too_short", { min: MIN_PASSWORD_LENGTH }) }, 400);
      }
      const result = await attempt(c, () => checkPassword(typeof current === "string" ? current : ""));
      if (result instanceof Response) return result;
      if (!result) return c.json({ error: msg("server_error_wrong_password") }, 403);
      await store.setPassword(await hashPassword(next));
      key = await signingKey();
      options.onPasswordChange?.();
      await startSession(c);
      return c.json({ ok: true });
    }),
  );

  routes.get("/passkeys", signedIn((c) => Promise.resolve(c.json<{ passkeys: PasskeyInfo[] }>({ passkeys: passkeys.list() }))));

  // The challenge for a new passkey; asks for the password once more
  routes.post(
    "/passkeys/options",
    signedIn(async (c, session) => {
      const { password } = await body(c);
      const result = await attempt(c, () => checkPassword(typeof password === "string" ? password : ""));
      if (result instanceof Response) return result;
      if (!result) return c.json({ error: msg("server_error_wrong_password") }, 403);
      return c.json(await passkeys.registrationOptions(c.req.header("origin"), session.id));
    }),
  );

  // Stores the passkey the browser made for the challenge from /passkeys/options
  routes.post(
    "/passkeys",
    signedIn(async (c, session) => {
      const { response, name } = await body(c);
      const passkey = await passkeys.register(
        c.req.header("origin"),
        session.id,
        response as RegistrationResponseJSON | undefined,
        name,
      );
      return c.json({ passkey });
    }),
  );

  routes.patch(
    "/passkeys/:id",
    signedIn(async (c) => {
      await passkeys.rename(c.req.param("id") ?? "", (await body(c)).name);
      return c.json({ ok: true });
    }),
  );

  routes.delete(
    "/passkeys/:id",
    signedIn(async (c) => {
      await passkeys.remove(c.req.param("id") ?? "");
      return c.json({ ok: true });
    }),
  );

  routes.post("/passkey/options", async (c) => {
    try {
      return c.json(await passkeys.loginOptions(c.req.header("origin"), clientKey(c)));
    } catch (error) {
      if (error instanceof AuthError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/passkey/login", async (c) => {
    const { response } = await body(c);
    // An expired or made-up challenge counts as a failed attempt too, and says so
    const refused: { error?: AuthError } = {};
    const result = await attempt(c, async () => {
      try {
        return await passkeys.verifyLogin(c.req.header("origin"), response as AuthenticationResponseJSON | undefined);
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        refused.error = error;
        return false;
      }
    });
    if (result instanceof Response) return result;
    if (refused.error) return c.json({ error: refused.error.message }, refused.error.status);
    if (!result) return c.json({ error: msg("server_error_passkey_unknown") }, 401);
    await startSession(c);
    return c.json<AuthSession>({ enabled: true, authenticated: true, username: options.username });
  });

  // Guards everything except the auth routes themselves, the metrics and the MCP endpoint, which
  // check their own token, and the health check of the container, which tells nothing
  const middleware: MiddlewareHandler = async (c, next) => {
    if (
      c.req.path.startsWith("/api/auth/") || c.req.path === "/api/metrics" || c.req.path === "/api/mcp" ||
      c.req.path === "/api/health"
    ) {
      return next();
    }
    if (!(await readSession(c))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };

  return { routes, middleware };
};

// Routes for when no credentials are configured: the UI stays open, as before
export const disabledAuthRoutes = new Hono().get(
  "/session",
  (c) => c.json<AuthSession>({ enabled: false, authenticated: true }),
);

/**
 * Random secret kept next to the app data, so sessions survive restarts. createAuth mixes in the
 * credentials, so changing the password logs everyone out.
 */
export const loadSessionSecret = async (): Promise<string> => {
  const path = resolveFromBase(".session-secret");
  try {
    return (await Deno.readTextFile(path)).trim();
  } catch {
    await Deno.mkdir(BASE_PATH, { recursive: true });
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await Deno.writeTextFile(path, secret, { mode: 0o600 });
    return secret;
  }
};

export const readAuthEnv = (): { username: string; password: string; sessionTtlSeconds: number } | null => {
  const username = Deno.env.get("SNAPRAID_UI_USERNAME") ?? "";
  const password = Deno.env.get("SNAPRAID_UI_PASSWORD") ?? "";
  if (!username || !password) return null;
  const hours = Number(Deno.env.get("SNAPRAID_UI_SESSION_HOURS") ?? "168");
  return {
    username,
    password,
    sessionTtlSeconds: Math.round((Number.isFinite(hours) && hours > 0 ? hours : 168) * 3600),
  };
};
