import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { BASE_PATH, resolveFromBase } from "../config.ts";

Deno.test("resolveFromBase - relative paths are resolved against BASE_PATH", () => {
  assertEquals(resolveFromBase("snapraid.conf"), join(BASE_PATH, "snapraid.conf"));
  assertEquals(resolveFromBase("configs/media.conf"), join(BASE_PATH, "configs", "media.conf"));
});

Deno.test("resolveFromBase - absolute paths are kept as is", () => {
  assertEquals(resolveFromBase("/mnt/parity/snapraid-media.conf"), "/mnt/parity/snapraid-media.conf");
});
