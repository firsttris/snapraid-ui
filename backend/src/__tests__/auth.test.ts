import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { Hono } from "hono";
import { createAuth, SESSION_COOKIE } from "../auth.ts";
import { type CredentialStore, hashPassword, loadCredentials, verifyPassword } from "../credentials.ts";
import { AuthError, relyingParty } from "../passkeys.ts";

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

// The client's address as Deno.serve passes it
const connection = (ip: string) => ({ remoteAddr: { transport: "tcp", hostname: ip, port: 50000 } });

const login = (app: Hono, username: string, password: string, ip = "10.0.0.1", headers: Record<string, string> = {}) =>
  app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ username, password }),
  }, connection(ip));

const sessionCookie = (res: Response): string => {
  const match = res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  assert(match, "session cookie set");
  return `${SESSION_COOKIE}=${match[1]}`;
};

Deno.test("auth - protected routes reject requests without session", async () => {
  const res = await (await buildApp()).request("/api/data");
  assertEquals(res.status, 401);
});

Deno.test("auth - login with valid credentials grants access", async () => {
  const app = await buildApp();
  const res = await login(app, "admin", "secret");
  assertEquals(res.status, 200);
  const cookie = sessionCookie(res);
  assert(res.headers.get("set-cookie")?.includes("HttpOnly"));

  const data = await app.request("/api/data", { headers: { Cookie: cookie } });
  assertEquals(data.status, 200);

  const session = await app.request("/api/auth/session", { headers: { Cookie: cookie } });
  assertEquals(await session.json(), { enabled: true, authenticated: true, username: "admin", passkeys: false });
});

Deno.test("auth - wrong credentials are rejected", async () => {
  const app = await buildApp();
  assertEquals((await login(app, "admin", "wrong")).status, 401);
  assertEquals((await login(app, "root", "secret")).status, 401);
});

Deno.test("auth - forged token is rejected", async () => {
  const app = await buildApp();
  const cookie = sessionCookie(await login(await buildApp(undefined, "other"), "admin", "secret"));

  const res = await app.request("/api/data", { headers: { Cookie: cookie } });
  assertEquals(res.status, 401);
});

Deno.test("auth - locks out a client after repeated failures", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    assertEquals((await login(app, "admin", "wrong", "10.0.0.2")).status, 401);
  }
  const locked = await login(app, "admin", "secret", "10.0.0.2");
  assertEquals(locked.status, 429);
  assert(Number(locked.headers.get("retry-after")) > 0);

  // Other clients are not affected
  assertEquals((await login(app, "admin", "secret", "10.0.0.3")).status, 200);
});

Deno.test("auth - forwarding headers do not escape the lockout", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    assertEquals((await login(app, "admin", "wrong", "10.0.0.4", { "X-Real-IP": `192.168.1.${i}` })).status, 401);
  }
  const spoofed = await login(app, "admin", "secret", "10.0.0.4", {
    "X-Real-IP": "192.168.1.99",
    "X-Forwarded-For": "192.168.1.99",
  });
  assertEquals(spoofed.status, 429);
});

Deno.test("auth - the health check needs no session", async () => {
  assertEquals((await (await buildApp()).request("/api/health")).status, 200);
});

const changePassword = (app: Hono, cookie: string, current: string, next: string, ip = "10.0.0.1") =>
  app.request("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ current, next }),
  }, connection(ip));

Deno.test("auth - passwords are hashed with PBKDF2 and checked against the hash", async () => {
  const hash = await hashPassword("correct horse", 1000);
  assert(hash.startsWith("pbkdf2-sha256$1000$"));
  assert(await verifyPassword("correct horse", hash));
  assertFalse(await verifyPassword("correct horsE", hash));
  assertFalse(await verifyPassword("correct horse", "plain"));
});

Deno.test("auth - changing the password ends the other sessions", async () => {
  const app = await buildApp();
  const mine = sessionCookie(await login(app, "admin", "secret"));
  const other = sessionCookie(await login(app, "admin", "secret"));

  assertEquals((await changePassword(app, mine, "wrong", "a-new-long-password")).status, 403);
  assertEquals((await changePassword(app, mine, "secret", "short")).status, 400);
  const changed = await changePassword(app, mine, "secret", "a-new-long-password");
  assertEquals(changed.status, 200);

  // This browser gets a new cookie, the other session is over
  const renewed = sessionCookie(changed);
  assertEquals((await app.request("/api/data", { headers: { Cookie: renewed } })).status, 200);
  assertEquals((await app.request("/api/data", { headers: { Cookie: other } })).status, 401);
  assertEquals((await login(app, "admin", "secret", "10.0.0.5")).status, 401);
  assertEquals((await login(app, "admin", "a-new-long-password")).status, 200);
});

Deno.test("auth - changing the password needs a session", async () => {
  const app = await buildApp();
  assertEquals((await changePassword(app, "", "secret", "a-new-long-password")).status, 401);
});

Deno.test("auth - a wrong current password counts against the lockout", async () => {
  const app = await buildApp();
  const cookie = sessionCookie(await login(app, "admin", "secret"));
  for (let i = 0; i < 5; i++) {
    assertEquals((await changePassword(app, cookie, "wrong", "a-new-long-password", "10.0.0.6")).status, 403);
  }
  assertEquals((await changePassword(app, cookie, "secret", "a-new-long-password", "10.0.0.6")).status, 429);
});

Deno.test("auth - the password set in the UI survives a restart, new environment credentials drop it", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const path = join(dir, "auth.json");
    const app = await buildApp(await loadCredentials(path, "admin", "secret", { iterations: 1000 }));
    const cookie = sessionCookie(await login(app, "admin", "secret"));
    assertEquals((await changePassword(app, cookie, "secret", "a-new-long-password")).status, 200);
    assertEquals((await Deno.stat(path)).mode! & 0o777, 0o600);
    assertFalse((await Deno.readTextFile(path)).includes("a-new-long-password"));

    const restarted = await buildApp(await loadCredentials(path, "admin", "secret"));
    assertEquals((await login(restarted, "admin", "a-new-long-password")).status, 200);
    assertEquals((await login(restarted, "admin", "secret", "10.0.0.7")).status, 401);

    // A new SNAPRAID_UI_PASSWORD: the file goes, the environment's password applies again
    const reset = await loadCredentials(path, "admin", "another-secret");
    assertEquals(reset.passwordHash(), null);
    assertEquals(reset.passkeys(), []);
    await Deno.stat(path).then(() => assert(false, "auth.json removed"), () => {});
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("passkeys - the relying party is the host name the browser was on", () => {
  assertEquals(relyingParty("https://nas.example.org"), { origin: "https://nas.example.org", rpId: "nas.example.org" });
  assertEquals(relyingParty("https://nas.example.org:8443"), {
    origin: "https://nas.example.org:8443",
    rpId: "nas.example.org",
  });
  assertEquals(relyingParty("http://localhost:3000"), { origin: "http://localhost:3000", rpId: "localhost" });
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

Deno.test("passkeys - a login challenge works once, an unknown passkey is a failed login", async () => {
  const app = await buildApp();
  const options = await (await post(app, "/passkey/options", {})).json();
  assertEquals(options.rpId, "nas.example.org");
  assertEquals(options.userVerification, "required");

  assertEquals((await post(app, "/passkey/login", { response: signed(options.challenge, "nobody") })).status, 401);
  // Used up, and a made-up one is refused the same way
  assertEquals((await post(app, "/passkey/login", { response: signed(options.challenge, "nobody") })).status, 400);
  assertEquals((await post(app, "/passkey/login", { response: signed("made-up") })).status, 400);
});

Deno.test("passkeys - a challenge for another host does not log in here", async () => {
  const app = await buildApp();
  const options = await (await post(app, "/passkey/options", {}, { Origin: "https://other.example.org" })).json();
  assertEquals((await post(app, "/passkey/login", { response: signed(options.challenge) })).status, 400);
});

Deno.test("passkeys - failed passkey logins count against the lockout", async () => {
  const app = await buildApp();
  for (let i = 0; i < 5; i++) {
    assertEquals((await post(app, "/passkey/login", { response: signed("made-up") }, {}, "10.0.0.8")).status, 400);
  }
  assertEquals((await login(app, "admin", "secret", "10.0.0.8")).status, 429);
});

Deno.test("passkeys - not offered over plain HTTP or an IP address", async () => {
  const app = await buildApp();
  assertEquals((await post(app, "/passkey/options", {}, { Origin: "http://192.168.1.2:3000" })).status, 400);
});

Deno.test("passkeys - adding one needs the session and the password again", async () => {
  const app = await buildApp();
  assertEquals((await post(app, "/passkeys/options", { password: "secret" })).status, 401);

  const cookie = sessionCookie(await login(app, "admin", "secret"));
  assertEquals((await post(app, "/passkeys/options", { password: "wrong" }, { Cookie: cookie })).status, 403);
  const res = await post(app, "/passkeys/options", { password: "secret" }, { Cookie: cookie });
  assertEquals(res.status, 200);
  const options = await res.json();
  assertEquals(options.rp, { name: "SnapRAID UI", id: "nas.example.org" });
  assertEquals(options.authenticatorSelection.userVerification, "required");

  // The challenge belongs to this session: another one cannot use it
  const other = sessionCookie(await login(app, "admin", "secret"));
  const response = signed(options.challenge);
  assertEquals((await post(app, "/passkeys", { response, name: "Laptop" }, { Cookie: other })).status, 400);
  // A name is required
  assertEquals((await post(app, "/passkeys", { response, name: " " }, { Cookie: cookie })).status, 400);
});

Deno.test("passkeys - listing and removing need a session, unknown ones are not found", async () => {
  const app = await buildApp();
  assertEquals((await app.request("/api/auth/passkeys")).status, 401);
  const cookie = sessionCookie(await login(app, "admin", "secret"));
  assertEquals(await (await app.request("/api/auth/passkeys", { headers: { Cookie: cookie } })).json(), { passkeys: [] });
  assertEquals(
    (await app.request("/api/auth/passkeys/nobody", { method: "DELETE", headers: { Cookie: cookie } })).status,
    404,
  );
});
