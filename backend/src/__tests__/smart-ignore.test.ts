import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  editSmartIgnore,
  effectiveSmartIgnore,
  isSmartIgnoreAttribute,
  parseSmartIgnoreLine,
  SmartIgnoreFullError,
} from "../smart-ignore.ts";
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

Deno.test("editSmartIgnore - refuses a fifth attribute, SnapRAID would refuse the config", () => {
  const lines = ["smartignore d1 1 7 10 Power_On_Hours", ""];
  assertThrows(() => editSmartIgnore(lines, "d1", "Load_Cycle_Count", true), SmartIgnoreFullError);
  // Taking one back makes room
  const three = editSmartIgnore(lines, "d1", "7", false);
  assertEquals(editSmartIgnore(three, "d1", "Load_Cycle_Count", true)[0], "smartignore d1 1 10 Power_On_Hours Load_Cycle_Count");
});

Deno.test("effectiveSmartIgnore - a later line overwrites the slots of an earlier one, like SnapRAID", () => {
  // SnapRAID 15 with these two lines ignores 12 and 9, and reports 5 again
  const rules = ["smartignore * 5 9", "smartignore * 12"].map((line) => parseSmartIgnoreLine(line)!);
  assertEquals(effectiveSmartIgnore(rules), [{ disk: "*", attributes: ["12", "9"] }]);
});

Deno.test("editSmartIgnore - merges a disk's lines into one with what SnapRAID applies", () => {
  const lines = ["smartignore * 5 9", "data d1 /mnt/disk1/", "smartignore * 12", ""];
  assertEquals(editSmartIgnore(lines, "*", "5", true), ["smartignore * 12 9 5", "data d1 /mnt/disk1/", ""]);
  assertEquals(editSmartIgnore(lines, "*", "9", false), ["smartignore * 12", "data d1 /mnt/disk1/", ""]);
  // 5 is not applied, so there is nothing to take back
  assertEquals(editSmartIgnore(lines, "*", "5", false), lines);
});

Deno.test("isSmartIgnoreAttribute - what SnapRAID accepts", () => {
  for (const name of ["Raw_Read_Error_Rate", "Avg_Program/Erase_Ct", "DriveLife_Remaining%", "SSD_LifeLeft(0.01%)", "1", "255"]) {
    assertEquals(isSmartIgnoreAttribute(name), true, name);
  }
  for (const name of ["0", "256", "", "two words", "x".repeat(128)]) {
    assertEquals(isSmartIgnoreAttribute(name), false, name);
  }
});

Deno.test("parseSnapRaidConfig - smartignore rules", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const path = join(dir, "snapraid.conf");
    await Deno.writeTextFile(path, `${CONFIG}smartignore d1 Raw_Read_Error_Rate\nextra x1 /mnt/extra1/\nsmartignore * 199\n`);
    const parsed = await parseSnapRaidConfig(path);
    assertEquals(parsed.smartIgnore, [
      { disk: "*", attributes: ["199"] },
      { disk: "d1", attributes: ["Raw_Read_Error_Rate"] },
    ]);
    assertEquals(parsed.extra, { x1: "/mnt/extra1/" });
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
