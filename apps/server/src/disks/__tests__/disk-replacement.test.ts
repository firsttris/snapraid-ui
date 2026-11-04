import { expect, test } from "bun:test";
import { assertThrows } from "../../__tests__/assert-error.ts";
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

test("applyReplacementPath - points a data disk to its new location and moves its content file", () => {
  const { config, diskType, oldPath } = applyReplacementPath(CONFIG, "d1", "/mnt/new1");

  expect(diskType).toEqual("data");
  expect(oldPath).toEqual("/mnt/disk1");
  expect(config).toEqual(`parity /mnt/parity1/snapraid.parity
content /mnt/parity1/snapraid.content
2-parity /mnt/p2a/a.parity,/mnt/p2b/b.parity
data d1 /mnt/new1
content /mnt/new1/.snapraid.content
data d2 /mnt/disk2/
content /mnt/disk2/.snapraid.content
content /mnt/disk10/.snapraid.content
exclude *.tmp`);
});

test("applyReplacementPath - keeps the config when the new disk is mounted at the same path", () => {
  const { config, oldPath } = applyReplacementPath(CONFIG, "d2", "/mnt/disk2/");

  expect(oldPath).toEqual("/mnt/disk2/");
  expect(config).toEqual(CONFIG);
});

test("applyReplacementPath - moves a parity file and content files next to it", () => {
  const { config, diskType, oldPath } = applyReplacementPath(CONFIG, "parity", "/mnt/parity9/snapraid.parity");

  expect(diskType).toEqual("parity");
  expect(oldPath).toEqual("/mnt/parity1/snapraid.parity");
  expect(config.split("\n").slice(0, 2)).toEqual([
    "parity /mnt/parity9/snapraid.parity",
    "content /mnt/parity9/snapraid.content",
  ]);
});

test("applyReplacementPath - split parity can only be replaced in place", () => {
  const { config } = applyReplacementPath(CONFIG, "2-parity", "/mnt/p2a/a.parity,/mnt/p2b/b.parity");
  expect(config).toEqual(CONFIG);

  assertThrows(
    () => applyReplacementPath(CONFIG, "2-parity", "/mnt/p2c/c.parity"),
    DiskReplacementError,
    "server_error_split_parity_in_place",
  );
});

test("applyReplacementPath - rejects unknown disks and parity paths without .parity", () => {
  assertThrows(() => applyReplacementPath(CONFIG, "d9", "/mnt/x"), DiskReplacementError, "server_error_disk_not_found");
  assertThrows(() => applyReplacementPath(CONFIG, "parity", "/mnt/x"), DiskReplacementError, "server_error_parity_extension");
});

test("requiredDirectory - data directory or the directory of the parity file", () => {
  expect(requiredDirectory("data", "/mnt/new1")).toEqual("/mnt/new1");
  expect(requiredDirectory("parity", "/mnt/parity9/snapraid.parity")).toEqual("/mnt/parity9");
});
