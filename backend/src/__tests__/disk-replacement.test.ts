import { assertEquals, assertThrows } from "@std/assert";
import { applyReplacementPath, DiskReplacementError, requiredDirectory } from "../disk-replacement.ts";

const CONFIG = `parity /mnt/parity1/snapraid.parity
content /mnt/parity1/snapraid.content
2-parity /mnt/p2a/a.parity,/mnt/p2b/b.parity
data d1 /mnt/disk1
content /mnt/disk1/.snapraid.content
data d2 /mnt/disk2/
content /mnt/disk2/.snapraid.content
content /mnt/disk10/.snapraid.content
exclude *.tmp`;

Deno.test("applyReplacementPath - points a data disk to its new location and moves its content file", () => {
  const { config, diskType, oldPath } = applyReplacementPath(CONFIG, "d1", "/mnt/new1");

  assertEquals(diskType, "data");
  assertEquals(oldPath, "/mnt/disk1");
  assertEquals(config, `parity /mnt/parity1/snapraid.parity
content /mnt/parity1/snapraid.content
2-parity /mnt/p2a/a.parity,/mnt/p2b/b.parity
data d1 /mnt/new1
content /mnt/new1/.snapraid.content
data d2 /mnt/disk2/
content /mnt/disk2/.snapraid.content
content /mnt/disk10/.snapraid.content
exclude *.tmp`);
});

Deno.test("applyReplacementPath - keeps the config when the new disk is mounted at the same path", () => {
  const { config, oldPath } = applyReplacementPath(CONFIG, "d2", "/mnt/disk2/");

  assertEquals(oldPath, "/mnt/disk2/");
  assertEquals(config, CONFIG);
});

Deno.test("applyReplacementPath - moves a parity file and content files next to it", () => {
  const { config, diskType, oldPath } = applyReplacementPath(CONFIG, "parity", "/mnt/parity9/snapraid.parity");

  assertEquals(diskType, "parity");
  assertEquals(oldPath, "/mnt/parity1/snapraid.parity");
  assertEquals(config.split("\n").slice(0, 2), [
    "parity /mnt/parity9/snapraid.parity",
    "content /mnt/parity9/snapraid.content",
  ]);
});

Deno.test("applyReplacementPath - split parity can only be replaced in place", () => {
  const { config } = applyReplacementPath(CONFIG, "2-parity", "/mnt/p2a/a.parity,/mnt/p2b/b.parity");
  assertEquals(config, CONFIG);

  assertThrows(
    () => applyReplacementPath(CONFIG, "2-parity", "/mnt/p2c/c.parity"),
    DiskReplacementError,
    "server_error_split_parity_in_place",
  );
});

Deno.test("applyReplacementPath - rejects unknown disks and parity paths without .parity", () => {
  assertThrows(() => applyReplacementPath(CONFIG, "d9", "/mnt/x"), DiskReplacementError, "server_error_disk_not_found");
  assertThrows(() => applyReplacementPath(CONFIG, "parity", "/mnt/x"), DiskReplacementError, "server_error_parity_extension");
});

Deno.test("requiredDirectory - data directory or the directory of the parity file", () => {
  assertEquals(requiredDirectory("data", "/mnt/new1"), "/mnt/new1");
  assertEquals(requiredDirectory("parity", "/mnt/parity9/snapraid.parity"), "/mnt/parity9");
});
