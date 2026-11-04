import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isBackendPath, loadFrontend } from "../frontend.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

test("frontend - backend paths stay with the backend", () => {
  for (const path of ["/api", "/api/config", "/ws", "/ws/"]) expect(isBackendPath(path), path).toEqual(true);
  for (const path of ["/", "/logs", "/apidocs", "/wsx", "/assets/api.js"]) expect(isBackendPath(path), path).toEqual(false);
});

test("frontend - not built", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    expect(await loadFrontend(pathToFileURL(join(dir, "index.mjs")))).toEqual(null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("frontend - loads the fetch handler of the build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const entry = join(dir, "index.mjs");
    await writeFile(entry, 'export default { fetch: (req) => new Response("ui " + new URL(req.url).pathname) };');
    const handler = await loadFrontend(pathToFileURL(entry));
    expect(await (await handler!(new Request("http://localhost/logs"))).text()).toEqual("ui /logs");
  } finally {
    await rm(dir, { recursive: true });
  }
});
