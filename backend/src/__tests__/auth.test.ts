import { expect, test } from "bun:test";
import { assertThrows } from "./assert-error.ts";
import { join } from "node:path";
import type { Server } from "bun";
import { Hono } from "hono";
import { createAuth, SESSION_COOKIE } from "../auth.ts";
import { type CredentialStore, hashPassword, loadCredentials, verifyPassword } from "../credentials.ts";
import { AuthError, createPasskeys, relyingParty } from "../passkeys.ts";
import { broadcast, closeAllClients, handleWebSocketUpgrade, websocket } from "../websocket.ts";
import { setEngine } from "../engine/engine.ts";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// Few PBKDF2 rounds for the hash of the environment credentials, the tests make many stores
const memoryStore = () => loadCredentials(null, "admin", "secret", { iterations: 1000 });

const buildApp = async (store?: CredentialStore, secret = "test-secret") => {
  const auth = await createAuth({
    username: "admin",
    password: "secret",
    secret,
    sessionTtlSeconds: 3600,
    store: store ?? await memoryStore(),
  });
  const app = new Hono();
  app.use("/api/*", auth.middleware);
  app.route("/api/auth", auth.routes);
  app.get("/api/data", (c) => c.json({ ok: true }));
  app.get("/api/health", (c) => c.json({ status: "ok" }));
  return app;
};

// The server the request came to, as Bun.serve passes it, knows the client's address
const connection = (ip: string) => ({ requestIP: () => ({ address: ip, family: "IPv4", port: 50000 }) });

const login = (app: Hono, username: string, password: string, ip = "10.0.0.1", headers: Record<string, string> = {}) =>
  app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ username, password }),
  }, connection(ip));

const sessionCookie = (res: Response): string => {
  const match = res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  expect(match, "session cookie set").toBeTruthy();
  return `${SESSION_COOKIE}=${match![1]}`;
};

test("auth - protected routes reject requests without session", async () => {
  const res = await (await buildApp()).request("/api/data");
  expect(res.status).toEqual(401);
});

test("auth - login with valid credentials grants access", async () => {
  const app = await buildApp();
  const res = await login(app, "admin", "secret");
  expect(res.status).toEqual(200);
  const cookie = sessionCookie(res);
  expect(res.headers.get("set-cookie")?.includes("HttpOnly")).toBeTruthy();

  const data = await app.request("/api/data", { headers: { Cookie: cookie } });
  expect(data.status).toEqual(200);

  const session = await app.request("/api/auth/session", { headers: { Cookie: cookie } });
  expect(await session.json()).toEqual({ enabled: true, authenticated: true, username: "admin", passkeys: false });
});

test("auth - wrong credentials are rejected", async () => {
  const app = await buildApp();
  expect((await login(app, "admin", "wrong")).status).toEqual(401);
  expect((await login(app, "root", "secret")).status).toEqual(401);
});

test("auth - forged token is rejected", async () => {
  const app = await buildApp();
  const cookie = sessionCookie(await login(await buildApp(undefined, "other"), "admin", "secret"));

  const res = await app.request("/api/data", { headers: { Cookie: cookie } });
  expect(res.status).toEqual(401);
});

test("auth - locks out a client after repeated failures", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    expect((await login(app, "admin", "wrong", "10.0.0.2")).status).toEqual(401);
  }
  const locked = await login(app, "admin", "secret", "10.0.0.2");
  expect(locked.status).toEqual(429);
  expect(Number(locked.headers.get("retry-after")) > 0).toBeTruthy();

  // Other clients are not affected
  expect((await login(app, "admin", "secret", "10.0.0.3")).status).toEqual(200);
});

test("auth - forwarding headers do not escape the lockout", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    expect((await login(app, "admin", "wrong", "10.0.0.4", { "X-Real-IP": `192.168.1.${i}` })).status).toEqual(401);
  }
  const spoofed = await login(app, "admin", "secret", "10.0.0.4", {
    "X-Real-IP": "192.168.1.99",
    "X-Forwarded-For": "192.168.1.99",
  });
  expect(spoofed.status).toEqual(429);
});

test("auth - the health check needs no session", async () => {
  expect((await (await buildApp()).request("/api/health")).status).toEqual(200);
});

const changePassword = (app: Hono, cookie: string, current: string, next: string, ip = "10.0.0.1") =>
  app.request("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ current, next }),
  }, connection(ip));

test("auth - passwords are hashed with PBKDF2 and checked against the hash", async () => {
  const hash = await hashPassword("correct horse", 1000);
  expect(hash.startsWith("pbkdf2-sha256$1000$")).toBeTruthy();
  expect(await verifyPassword("correct horse", hash)).toBeTruthy();
  expect(await verifyPassword("correct horsE", hash)).toBeFalsy();
  expect(await verifyPassword("correct horse", "plain")).toBeFalsy();
});

test("auth - changing the password ends the other sessions", async () => {
  const app = await buildApp();
  const mine = sessionCookie(await login(app, "admin", "secret"));
  const other = sessionCookie(await login(app, "admin", "secret"));

  expect((await changePassword(app, mine, "wrong", "a-new-long-password")).status).toEqual(403);
  expect((await changePassword(app, mine, "secret", "short")).status).toEqual(400);
  const changed = await changePassword(app, mine, "secret", "a-new-long-password");
  expect(changed.status).toEqual(200);

  // This browser gets a new cookie, the other session is over
  const renewed = sessionCookie(changed);
  expect((await app.request("/api/data", { headers: { Cookie: renewed } })).status).toEqual(200);
  expect((await app.request("/api/data", { headers: { Cookie: other } })).status).toEqual(401);
  expect((await login(app, "admin", "secret", "10.0.0.5")).status).toEqual(401);
  expect((await login(app, "admin", "a-new-long-password")).status).toEqual(200);
});

test("auth - changing the password needs a session", async () => {
  const app = await buildApp();
  expect((await changePassword(app, "", "secret", "a-new-long-password")).status).toEqual(401);
});

test("auth - a wrong current password counts against the lockout", async () => {
  const app = await buildApp();
  const cookie = sessionCookie(await login(app, "admin", "secret"));
  for (let i = 0; i < 5; i++) {
    expect((await changePassword(app, cookie, "wrong", "a-new-long-password", "10.0.0.6")).status).toEqual(403);
  }
  expect((await changePassword(app, cookie, "secret", "a-new-long-password", "10.0.0.6")).status).toEqual(429);
});

test("auth - the password set in the UI survives a restart, new environment credentials drop it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const path = join(dir, "auth.json");
    const app = await buildApp(await loadCredentials(path, "admin", "secret", { iterations: 1000 }));
    const cookie = sessionCookie(await login(app, "admin", "secret"));
    expect((await changePassword(app, cookie, "secret", "a-new-long-password")).status).toEqual(200);
    expect((await stat(path)).mode! & 0o777).toEqual(0o600);
    expect((await readFile(path, "utf8")).includes("a-new-long-password")).toBeFalsy();

    const restarted = await buildApp(await loadCredentials(path, "admin", "secret"));
    expect((await login(restarted, "admin", "a-new-long-password")).status).toEqual(200);
    expect((await login(restarted, "admin", "secret", "10.0.0.7")).status).toEqual(401);

    // A new SNAPRAID_UI_PASSWORD: the file goes, the environment's password applies again
    const reset = await loadCredentials(path, "admin", "another-secret");
    expect(reset.passwordHash()).toEqual(null);
    expect(reset.passkeys()).toEqual([]);
    await stat(path).then(() => expect(false, "auth.json removed").toBeTruthy(), () => {});
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("passkeys - the relying party is the host name the browser was on", () => {
  expect(relyingParty("https://nas.example.org")).toEqual({ origin: "https://nas.example.org", rpId: "nas.example.org" });
  expect(relyingParty("https://nas.example.org:8443")).toEqual({
    origin: "https://nas.example.org:8443",
    rpId: "nas.example.org",
  });
  expect(relyingParty("http://localhost:3000")).toEqual({ origin: "http://localhost:3000", rpId: "localhost" });
  // Plain HTTP, IP addresses and requests without Origin cannot have passkeys
  for (const origin of ["http://nas.example.org", "https://192.168.1.2", "https://[::1]", "null", undefined]) {
    assertThrows(() => relyingParty(origin), AuthError);
  }
});

const post = (app: Hono, path: string, body: unknown, headers: Record<string, string> = {}, ip = "10.0.0.1") =>
  app.request(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://nas.example.org", ...headers },
    body: JSON.stringify(body),
  }, connection(ip));

/** A browser's answer that signed `challenge`; enough to reach the challenge and key checks */
const signed = (challenge: string, id = "cred-1") => ({
  id,
  rawId: id,
  type: "public-key",
  clientExtensionResults: {},
  response: {
    clientDataJSON: btoa(JSON.stringify({ type: "webauthn.get", challenge, origin: "https://nas.example.org" }))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  },
});

test("passkeys - a login challenge works once, an unknown passkey is a failed login", async () => {
  const app = await buildApp();
  const options: any = await (await post(app, "/passkey/options", {})).json();
  expect(options.rpId).toEqual("nas.example.org");
  expect(options.userVerification).toEqual("required");

  expect((await post(app, "/passkey/login", { response: signed(options.challenge, "nobody") })).status).toEqual(401);
  // Used up, and a made-up one is refused the same way
  expect((await post(app, "/passkey/login", { response: signed(options.challenge, "nobody") })).status).toEqual(400);
  expect((await post(app, "/passkey/login", { response: signed("made-up") })).status).toEqual(400);
});

test("passkeys - a challenge for another host does not log in here", async () => {
  const app = await buildApp();
  const options: any = await (await post(app, "/passkey/options", {}, { Origin: "https://other.example.org" })).json();
  expect((await post(app, "/passkey/login", { response: signed(options.challenge) })).status).toEqual(400);
});

test("passkeys - failed passkey logins count against the lockout", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    expect((await post(app, "/passkey/login", { response: signed("made-up") }, {}, "10.0.0.8")).status).toEqual(400);
  }
  expect((await login(app, "admin", "secret", "10.0.0.8")).status).toEqual(429);
});

test("passkeys - not offered over plain HTTP or an IP address", async () => {
  const app = await buildApp();
  expect((await post(app, "/passkey/options", {}, { Origin: "http://192.168.1.2:3000" })).status).toEqual(400);
});

test("passkeys - adding one needs the session and the password again", async () => {
  const app = await buildApp();
  expect((await post(app, "/passkeys/options", { password: "secret" })).status).toEqual(401);

  const cookie = sessionCookie(await login(app, "admin", "secret"));
  expect((await post(app, "/passkeys/options", { password: "wrong" }, { Cookie: cookie })).status).toEqual(403);
  const res = await post(app, "/passkeys/options", { password: "secret" }, { Cookie: cookie });
  expect(res.status).toEqual(200);
  const options: any = await res.json();
  expect(options.rp).toEqual({ name: "SnapRAID UI", id: "nas.example.org" });
  expect(options.authenticatorSelection.userVerification).toEqual("required");

  // The challenge belongs to this session: another one cannot use it
  const other = sessionCookie(await login(app, "admin", "secret"));
  const response = signed(options.challenge);
  expect((await post(app, "/passkeys", { response, name: "Laptop" }, { Cookie: other })).status).toEqual(400);
  // A name is required
  expect((await post(app, "/passkeys", { response, name: " " }, { Cookie: cookie })).status).toEqual(400);
});

test("passkeys - listing and removing need a session, unknown ones are not found", async () => {
  const app = await buildApp();
  expect((await app.request("/api/auth/passkeys")).status).toEqual(401);
  const cookie = sessionCookie(await login(app, "admin", "secret"));
  expect(await (await app.request("/api/auth/passkeys", { headers: { Cookie: cookie } })).json()).toEqual({ passkeys: [] });
  expect((await app.request("/api/auth/passkeys/nobody", { method: "DELETE", headers: { Cookie: cookie } })).status).toEqual(404);
});

test("auth - an auth.json that is not JSON is dropped at startup instead of stopping it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const path = join(dir, "auth.json");
    await writeFile(path, '{"environment": "x", "userId"');
    const store = await loadCredentials(path, "admin", "secret", { iterations: 1000 });
    expect(store.passwordHash()).toEqual(null);
    await stat(path).then(() => expect(false, "auth.json removed").toBeTruthy(), () => {});
  } finally {
    await rm(dir, { recursive: true });
  }
});

/** A browser's answer to a registration challenge; enough to reach the challenge check */
const registration = (challenge: string) => ({
  id: "x",
  rawId: "x",
  type: "public-key",
  clientExtensionResults: {},
  response: {
    clientDataJSON: btoa(JSON.stringify({ type: "webauthn.create", challenge, origin: "https://nas.example.org" }))
      .replaceAll("=", ""),
    attestationObject: "AA",
  },
}) as never;

test("passkeys - a flood of login requests pushes out neither a registration nor another client's login", async () => {
  const passkeys = createPasskeys(await memoryStore(), "admin");
  const origin = "https://nas.example.org";
  const pending = await passkeys.registrationOptions(origin, "session-1");
  const login = await passkeys.loginOptions(origin, "10.0.0.1");
  for (let i = 0; i < 1100; i++) await passkeys.loginOptions("https://attacker.example", "10.0.0.66");

  // The registration challenge is still there: the answer gets as far as its attestation
  const error = await passkeys.register(origin, "session-1", registration(pending.challenge), "Laptop")
    .then(() => "", (e: Error) => e.message);
  expect(error.includes("server_error_passkey_invalid"), error).toBeTruthy();
  // And so is the other client's login challenge: an unknown passkey, not an expired request
  expect(await passkeys.verifyLogin(origin, signed(login.challenge, "nobody") as never)).toBeFalsy();
});

test("auth - a new password closes the WebSockets, an ended session cannot connect again", async () => {
  setEngine({ currentJob: () => null } as never);
  const auth = await createAuth({
    username: "admin",
    password: "secret",
    secret: "s",
    sessionTtlSeconds: 3600,
    store: await memoryStore(),
    onPasswordChange: closeAllClients,
  });
  const app = new Hono<{ Bindings: Server<undefined> }>();
  app.use("/api/*", auth.middleware);
  app.use("/ws", auth.middleware);
  app.route("/api/auth", auth.routes);
  app.get("/ws", (c) => handleWebSocketUpgrade(c.req.raw, c.env));
  const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
  const base = `http://127.0.0.1:${server.port}`;
  const connect = (cookie: string) =>
    new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { Cookie: cookie } } as never);
  try {
    const signIn = async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });
      await res.body?.cancel();
      return sessionCookie(res);
    };
    const other = await signIn();
    const mine = await signIn();
    const socket = connect(other);
    const received: string[] = [];
    socket.onmessage = (event) => received.push(String(event.data));
    await new Promise((resolve) => (socket.onopen = resolve));
    const closed = new Promise((resolve) => (socket.onclose = resolve));

    const res = await fetch(`${base}/api/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: mine },
      body: JSON.stringify({ current: "secret", next: "a-new-long-password" }),
    });
    await res.body?.cancel();
    expect(res.status).toEqual(200);
    await closed;
    broadcast({ type: "output", chunk: "/mnt/disk1/private.txt" });
    expect(received).toEqual([]);

    // Connecting again with the ended session fails
    const again = connect(other);
    await new Promise((resolve) => {
      again.onerror = resolve;
      again.onclose = resolve;
    });
    expect(again.readyState).toEqual(WebSocket.CLOSED);
  } finally {
    await server.stop(true);
  }
});
