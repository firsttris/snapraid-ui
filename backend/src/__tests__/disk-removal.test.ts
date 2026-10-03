import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  DiskRemovalError,
  ensureEmptyDir,
  finalizeDataDiskRemoval,
  prepareDataDiskRemoval,
} from "../disk-removal.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";

const CONFIG = `parity /mnt/parity1/snapraid.parity
content /var/snapraid/snapraid.content
data d1 /mnt/disk1
content /mnt/disk1/.snapraid.content
data d2 /mnt/disk2/
content /mnt/disk2/.snapraid.content
exclude *.tmp`;

Deno.test("prepareDataDiskRemoval - points the disk to its empty directory and drops its content file", () => {
  const { config, emptyDir } = prepareDataDiskRemoval(CONFIG, "d2");

  assertEquals(emptyDir, "/mnt/disk2/.snapraid-removal");
  assertEquals(config, `parity /mnt/parity1/snapraid.parity
content /var/snapraid/snapraid.content
data d1 /mnt/disk1
content /mnt/disk1/.snapraid.content
data d2 /mnt/disk2/.snapraid-removal
exclude *.tmp`);
});

Deno.test("prepareDataDiskRemoval - retrying a pending removal keeps the same directory", () => {
  const first = prepareDataDiskRemoval(CONFIG, "d1");
  const second = prepareDataDiskRemoval(first.config, "d1");

  assertEquals(second, first);
});

Deno.test("prepareDataDiskRemoval - does not touch a disk whose path only shares a prefix", () => {
  const config = `${CONFIG}\ndata d10 /mnt/disk10\ncontent /mnt/disk10/.snapraid.content`;
  const { config: updated } = prepareDataDiskRemoval(config, "d1");

  assertEquals(updated.includes("content /mnt/disk10/.snapraid.content"), true);
  assertEquals(updated.includes("data d10 /mnt/disk10"), true);
});

Deno.test("prepareDataDiskRemoval - refuses to leave too few content files", () => {
  const config = `${CONFIG}\n2-parity /mnt/parity2/snapraid.2-parity`;

  assertThrows(() => prepareDataDiskRemoval(config, "d1"), DiskRemovalError, '"needed":3');
});

Deno.test("prepareDataDiskRemoval - refuses unknown and last data disks", () => {
  assertThrows(() => prepareDataDiskRemoval(CONFIG, "d9"), DiskRemovalError, "server_error_data_disk_not_found");
  assertThrows(
    () => prepareDataDiskRemoval("parity /p\ncontent /a\ncontent /b\ndata d1 /mnt/disk1", "d1"),
    DiskRemovalError,
    "server_error_last_data_disk",
  );
});

Deno.test("finalizeDataDiskRemoval - drops only a pending data line", () => {
  const { config } = prepareDataDiskRemoval(CONFIG, "d1");

  assertEquals(finalizeDataDiskRemoval(config, "d1").includes("data d1 "), false);
  assertEquals(finalizeDataDiskRemoval(CONFIG, "d1"), CONFIG);
});

Deno.test("parseSnapRaidConfig - lists disks pending removal", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const path = join(dir, "snapraid.conf");
    await Deno.writeTextFile(path, prepareDataDiskRemoval(CONFIG, "d1").config);
    const parsed = await parseSnapRaidConfig(path);

    assertEquals(parsed.pendingRemoval, ["d1"]);
    assertEquals(parsed.data.d1, "/mnt/disk1/.snapraid-removal");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("ensureEmptyDir - creates the directory and rejects leftovers", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const emptyDir = join(dir, ".snapraid-removal");
    await ensureEmptyDir(emptyDir);
    await ensureEmptyDir(emptyDir);

    await Deno.writeTextFile(join(emptyDir, "file"), "x");
    await assertRejects(() => ensureEmptyDir(emptyDir), DiskRemovalError, "server_error_not_empty");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
