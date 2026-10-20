import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { editSmartIgnore, parseSmartIgnoreLine } from "../smart-ignore.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";

const CONFIG = `parity /mnt/parity1/snapraid.parity
content /mnt/disk1/snapraid.content
data d1 /mnt/disk1/
data d2 /mnt/disk2/
smartignore * 194
`;

Deno.test("parseSmartIgnoreLine - disk and attributes, ids or names", () => {
  assertEquals(parseSmartIgnoreLine("smartignore  d1 197   Raw_Read_Error_Rate"), {
    disk: "d1",
    attributes: ["197", "Raw_Read_Error_Rate"],
  });
  assertEquals(parseSmartIgnoreLine("smartctl d1 -d sat %s"), null);
});

Deno.test("editSmartIgnore - starts a line after the others, adds to the disk's line, once", () => {
  const lines = CONFIG.split("\n");
  const once = editSmartIgnore(lines, "d1", "Raw_Read_Error_Rate", true);
  assertEquals(once.slice(-3), ["smartignore * 194", "smartignore d1 Raw_Read_Error_Rate", ""]);

  const twice = editSmartIgnore(once, "d1", "Spin_Up_Time", true);
  assertEquals(twice.at(-2), "smartignore d1 Raw_Read_Error_Rate Spin_Up_Time");
  // SnapRAID compares names case-insensitively
  assertEquals(editSmartIgnore(twice, "d1", "raw_read_error_rate", true), twice);

  const noRules = editSmartIgnore(["data d1 /mnt/disk1/", ""], "*", "Spin_Up_Time", true);
  assertEquals(noRules, ["data d1 /mnt/disk1/", "smartignore * Spin_Up_Time", ""]);
});

Deno.test("editSmartIgnore - stops ignoring, the last attribute takes its line along", () => {
  const lines = ["smartignore d1 197 Raw_Read_Error_Rate", "smartignore * 194", ""];
  assertEquals(editSmartIgnore(lines, "d1", "RAW_READ_ERROR_RATE", false), ["smartignore d1 197", "smartignore * 194", ""]);
  assertEquals(editSmartIgnore(lines, "*", "194", false), ["smartignore d1 197 Raw_Read_Error_Rate", ""]);
  // Another disk's rule stays
  assertEquals(editSmartIgnore(lines, "d2", "197", false), lines);
});

Deno.test("parseSnapRaidConfig - smartignore rules", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const path = join(dir, "snapraid.conf");
    await Deno.writeTextFile(path, `${CONFIG}smartignore d1 Raw_Read_Error_Rate\n`);
    assertEquals((await parseSnapRaidConfig(path)).smartIgnore, [
      { disk: "*", attributes: ["194"] },
      { disk: "d1", attributes: ["Raw_Read_Error_Rate"] },
    ]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
