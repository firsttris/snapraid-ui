import { expect, test } from "bun:test";
import { join } from "node:path";
import { diskManagementRoutes } from "../disk-management.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

test("add-data-disk - the content file path has no double slash, SnapRAID compares it as written", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const configPath = join(dir, "snapraid.conf");
    await writeFile(configPath, "parity /mnt/parity/snapraid.parity\ndata d1 /mnt/disk1/\nexclude /tmp/\n");

    const response = await diskManagementRoutes.request("/add-data-disk", {
      method: "POST",
      body: JSON.stringify({ configPath, diskName: "d2", diskPath: "/mnt/disk2/" }),
    });

    expect(response.status).toEqual(200);
    const lines = (await readFile(configPath, "utf8")).split("\n");
    expect(lines.includes("data d2 /mnt/disk2/")).toEqual(true);
    expect(lines.includes("content /mnt/disk2/.snapraid.content")).toEqual(true);
  } finally {
    await rm(dir, { recursive: true });
  }
});
