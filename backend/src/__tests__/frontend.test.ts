import { assertEquals } from "@std/assert";
import { join, toFileUrl } from "@std/path";
import { isBackendPath, loadFrontend } from "../frontend.ts";

Deno.test("frontend - backend paths stay with the backend", () => {
  for (const path of ["/api", "/api/config", "/ws", "/ws/"]) assertEquals(isBackendPath(path), true, path);
  for (const path of ["/", "/logs", "/apidocs", "/wsx", "/assets/api.js"]) assertEquals(isBackendPath(path), false, path);
});

Deno.test("frontend - not built", async () => {
  const dir = await Deno.makeTempDir();
  try {
    assertEquals(await loadFrontend(toFileUrl(join(dir, "index.mjs"))), null);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("frontend - loads the fetch handler of the build", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const entry = join(dir, "index.mjs");
    await Deno.writeTextFile(entry, 'export default { fetch: (req) => new Response("ui " + new URL(req.url).pathname) };');
    const handler = await loadFrontend(toFileUrl(entry));
    assertEquals(await (await handler!(new Request("http://localhost/logs"))).text(), "ui /logs");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
