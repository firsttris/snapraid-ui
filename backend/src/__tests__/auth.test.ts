import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import { createAuth, SESSION_COOKIE } from "../auth.ts";

const buildApp = () => {
  const auth = createAuth({ username: "admin", password: "secret", secret: "test-secret", sessionTtlSeconds: 3600 });
  const app = new Hono();
  app.use("/api/*", auth.middleware);
  app.route("/api/auth", auth.routes);
  app.get("/api/data", (c) => c.json({ ok: true }));
  return app;
};

const login = (app: Hono, username: string, password: string, ip = "10.0.0.1") =>
  app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify({ username, password }),
  });

const sessionCookie = (res: Response): string => {
  const match = res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  assert(match, "session cookie set");
  return `${SESSION_COOKIE}=${match[1]}`;
};

Deno.test("auth - protected routes reject requests without session", async () => {
  const res = await buildApp().request("/api/data");
  assertEquals(res.status, 401);
});

Deno.test("auth - login with valid credentials grants access", async () => {
  const app = buildApp();
  const res = await login(app, "admin", "secret");
  assertEquals(res.status, 200);
  const cookie = sessionCookie(res);
  assert(res.headers.get("set-cookie")?.includes("HttpOnly"));

  const data = await app.request("/api/data", { headers: { Cookie: cookie } });
  assertEquals(data.status, 200);

  const session = await app.request("/api/auth/session", { headers: { Cookie: cookie } });
  assertEquals(await session.json(), { enabled: true, authenticated: true, username: "admin" });
});

Deno.test("auth - wrong credentials are rejected", async () => {
  const app = buildApp();
  assertEquals((await login(app, "admin", "wrong")).status, 401);
  assertEquals((await login(app, "root", "secret")).status, 401);
});

Deno.test("auth - forged token is rejected", async () => {
  const app = buildApp();
  const other = createAuth({ username: "admin", password: "secret", secret: "other", sessionTtlSeconds: 3600 });
  const otherApp = new Hono().route("/api/auth", other.routes);
  const cookie = sessionCookie(await login(otherApp, "admin", "secret"));

  const res = await app.request("/api/data", { headers: { Cookie: cookie } });
  assertEquals(res.status, 401);
});

Deno.test("auth - locks out a client after repeated failures", async () => {
  const app = buildApp();
  for (let i = 0; i < 5; i++) {
    assertEquals((await login(app, "admin", "wrong", "10.0.0.2")).status, 401);
  }
  const locked = await login(app, "admin", "secret", "10.0.0.2");
  assertEquals(locked.status, 429);
  assert(Number(locked.headers.get("retry-after")) > 0);

  // Other clients are not affected
  assertEquals((await login(app, "admin", "secret", "10.0.0.3")).status, 200);
});
