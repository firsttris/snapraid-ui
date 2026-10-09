import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type { AuthSession } from "@shared/types.ts";
import { BASE_PATH, resolveFromBase } from "./config.ts";

export const SESSION_COOKIE = "snapraid_session";

// Failed logins per client before it has to wait
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// Slows down guessing even below the lockout
const FAILED_LOGIN_DELAY_MS = 500;

export interface AuthOptions {
  username: string;
  password: string;
  // Signs the session tokens, changing it logs everyone out
  secret: string;
  sessionTtlSeconds: number;
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
const safeEqual = async (a: string, b: string): Promise<boolean> => {
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

const clientKey = (c: Context): string =>
  c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";

const isHttps = (c: Context): boolean =>
  c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";

export const createAuth = (options: AuthOptions) => {
  const attempts = new Map<string, Attempts>();

  const readSession = async (c: Context): Promise<string | null> => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return null;
    try {
      const payload = await verify(token, options.secret, "HS256");
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  };

  const lockedUntil = (key: string): number | null => {
    const entry = attempts.get(key);
    if (!entry) return null;
    if (entry.resetAt <= Date.now()) {
      attempts.delete(key);
      return null;
    }
    return entry.count >= MAX_FAILED_ATTEMPTS ? entry.resetAt : null;
  };

  const recordFailure = (key: string): void => {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    } else {
      entry.count++;
    }
  };

  const routes = new Hono();

  routes.get("/session", async (c) => {
    const username = await readSession(c);
    return c.json<AuthSession>({
      enabled: true,
      authenticated: username !== null,
      ...(username ? { username } : {}),
    });
  });

  routes.post("/login", async (c) => {
    const key = clientKey(c);
    const locked = lockedUntil(key);
    if (locked) {
      const retryAfter = Math.ceil((locked - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many attempts", retryAfter }, 429);
    }

    const body = await c.req.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    // Both checks always run, so a wrong username takes as long as a wrong password
    const [userOk, passOk] = await Promise.all([
      safeEqual(username, options.username),
      safeEqual(password, options.password),
    ]);

    if (!userOk || !passOk) {
      recordFailure(key);
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
      return c.json({ error: "Invalid credentials" }, 401);
    }

    attempts.delete(key);
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: options.username, iat: now, exp: now + options.sessionTtlSeconds },
      options.secret,
      "HS256",
    );
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Strict",
      secure: isHttps(c),
      path: "/",
      maxAge: options.sessionTtlSeconds,
    });
    return c.json<AuthSession>({ enabled: true, authenticated: true, username: options.username });
  });

  routes.post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json<AuthSession>({ enabled: true, authenticated: false });
  });

  // Guards everything except the auth routes themselves and the metrics, which check their own token
  const middleware: MiddlewareHandler = async (c, next) => {
    if (c.req.path.startsWith("/api/auth/") || c.req.path === "/api/metrics") return next();
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
 * Random secret kept next to the app data, so sessions survive restarts.
 * Mixed with the credentials, so changing the password logs everyone out.
 */
export const loadSessionSecret = async (username: string, password: string): Promise<string> => {
  const path = resolveFromBase(".session-secret");
  let secret: string;
  try {
    secret = (await Deno.readTextFile(path)).trim();
  } catch {
    await Deno.mkdir(BASE_PATH, { recursive: true });
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await Deno.writeTextFile(path, secret, { mode: 0o600 });
  }
  return `${secret}:${await sha256Hex(`${username}\0${password}`)}`;
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
