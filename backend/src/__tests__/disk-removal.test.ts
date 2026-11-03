import { expect, test } from "bun:test";
import { assertRejects, assertThrows } from "./assert-error.ts";
import { join } from "node:path";
import {
  DiskRemovalError,
  ensureEmptyDir,
  finalizeDataDiskRemoval,
  prepareDataDiskRemoval,
} from "../disk-removal.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const CONFIG = `parity /mnt/parity1/snapraid.parity
content /var/snapraid/snapraid.content
data d1 /mnt/disk1
content /mnt/disk1/.snapraid.content
data d2 /mnt/disk2/
content /mnt/disk2/.snapraid.content
exclude *.tmp`;

test("prepareDataDiskRemoval - points the disk to its empty directory and drops its content file", () => {
  const { config, emptyDir } = prepareDataDiskRemoval(CONFIG, "d2");

  expect(emptyDir).toEqual("/mnt/disk2/.snapraid-removal");
  expect(config).toEqual(`parity /mnt/parity1/snapraid.parity
content /var/snapraid/snapraid.content
data d1 /mnt/disk1
content /mnt/disk1/.snapraid.content
data d2 /mnt/disk2/.snapraid-removal
exclude *.tmp`);
});

test("prepareDataDiskRemoval - retrying a pending removal keeps the same directory", () => {
  const first = prepareDataDiskRemoval(CONFIG, "d1");
  const second = prepareDataDiskRemoval(first.config, "d1");

  expect(second).toEqual(first);
});

test("prepareDataDiskRemoval - does not touch a disk whose path only shares a prefix", () => {
  const config = `${CONFIG}\ndata d10 /mnt/disk10\ncontent /mnt/disk10/.snapraid.content`;
  const { config: updated } = prepareDataDiskRemoval(config, "d1");

  expect(updated.includes("content /mnt/disk10/.snapraid.content")).toEqual(true);
  expect(updated.includes("data d10 /mnt/disk10")).toEqual(true);
});

test("prepareDataDiskRemoval - refuses to leave too few content files", () => {
  const config = `${CONFIG}\n2-parity /mnt/parity2/snapraid.2-parity`;

  assertThrows(() => prepareDataDiskRemoval(config, "d1"), DiskRemovalError, '"needed":3');
});

test("prepareDataDiskRemoval - refuses unknown and last data disks", () => {
  assertThrows(() => prepareDataDiskRemoval(CONFIG, "d9"), DiskRemovalError, "server_error_data_disk_not_found");
  assertThrows(
    () => prepareDataDiskRemoval("parity /p\ncontent /a\ncontent /b\ndata d1 /mnt/disk1", "d1"),
    DiskRemovalError,
    "server_error_last_data_disk",
  );
});

test("finalizeDataDiskRemoval - drops only a pending data line", () => {
  const { config } = prepareDataDiskRemoval(CONFIG, "d1");

  expect(finalizeDataDiskRemoval(config, "d1").includes("data d1 ")).toEqual(false);
  expect(finalizeDataDiskRemoval(CONFIG, "d1")).toEqual(CONFIG);
});

test("parseSnapRaidConfig - lists disks pending removal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const path = join(dir, "snapraid.conf");
    await writeFile(path, prepareDataDiskRemoval(CONFIG, "d1").config);
    const parsed = await parseSnapRaidConfig(path);

    expect(parsed.pendingRemoval).toEqual(["d1"]);
    expect(parsed.data.d1).toEqual("/mnt/disk1/.snapraid-removal");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("ensureEmptyDir - creates the directory and rejects leftovers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const emptyDir = join(dir, ".snapraid-removal");
    await ensureEmptyDir(emptyDir);
    await ensureEmptyDir(emptyDir);

    await writeFile(join(emptyDir, "file"), "x");
    await assertRejects(() => ensureEmptyDir(emptyDir), DiskRemovalError, "server_error_not_empty");
  } finally {
    await rm(dir, { recursive: true });
  }
});
