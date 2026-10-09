import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { diskManagementRoutes } from "../routes/disk-management.ts";

Deno.test("add-data-disk - the content file path has no double slash, SnapRAID compares it as written", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const configPath = join(dir, "snapraid.conf");
    await Deno.writeTextFile(configPath, "parity /mnt/parity/snapraid.parity\ndata d1 /mnt/disk1/\nexclude /tmp/\n");

    const response = await diskManagementRoutes.request("/add-data-disk", {
      method: "POST",
      body: JSON.stringify({ configPath, diskName: "d2", diskPath: "/mnt/disk2/" }),
    });

    assertEquals(response.status, 200);
    const lines = (await Deno.readTextFile(configPath)).split("\n");
    assertEquals(lines.includes("data d2 /mnt/disk2/"), true);
    assertEquals(lines.includes("content /mnt/disk2/.snapraid.content"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
