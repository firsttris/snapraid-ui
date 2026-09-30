import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { BASE_PATH, resolveFromBase, toStoredPath } from "../config.ts";

Deno.test("resolveFromBase - relative paths are resolved against BASE_PATH", () => {
  assertEquals(resolveFromBase("snapraid.conf"), join(BASE_PATH, "snapraid.conf"));
  assertEquals(resolveFromBase("configs/media.conf"), join(BASE_PATH, "configs", "media.conf"));
});

Deno.test("resolveFromBase - absolute paths are kept as is", () => {
  assertEquals(resolveFromBase("/mnt/parity/snapraid-media.conf"), "/mnt/parity/snapraid-media.conf");
});

Deno.test("toStoredPath - files inside BASE_PATH are stored relative", () => {
  assertEquals(toStoredPath(join(BASE_PATH, "snapraid.conf")), "snapraid.conf");
  assertEquals(toStoredPath(join(BASE_PATH, "configs", "media.conf")), join("configs", "media.conf"));
  assertEquals(toStoredPath("snapraid.conf"), "snapraid.conf");
});

Deno.test("toStoredPath - files outside BASE_PATH are stored absolute", () => {
  assertEquals(toStoredPath("/etc/snapraid.conf"), "/etc/snapraid.conf");
  assertEquals(toStoredPath("../outside.conf"), resolveFromBase("../outside.conf"));
});
