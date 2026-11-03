import { expect, test } from "bun:test";
import { assertThrows } from "./assert-error.ts";
import { join } from "node:path";
import {
  editSmartIgnore,
  effectiveSmartIgnore,
  isSmartIgnoreAttribute,
  parseSmartIgnoreLine,
  SmartIgnoreFullError,
} from "../smart-ignore.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const CONFIG = `parity /mnt/parity1/snapraid.parity
content /mnt/disk1/snapraid.content
data d1 /mnt/disk1/
data d2 /mnt/disk2/
smartignore * 194
`;

test("parseSmartIgnoreLine - disk and attributes, ids or names", () => {
  expect(parseSmartIgnoreLine("smartignore  d1 197   Raw_Read_Error_Rate")).toEqual({
    disk: "d1",
    attributes: ["197", "Raw_Read_Error_Rate"],
  });
  expect(parseSmartIgnoreLine("smartctl d1 -d sat %s")).toEqual(null);
});

test("editSmartIgnore - starts a line after the others, adds to the disk's line, once", () => {
  const lines = CONFIG.split("\n");
  const once = editSmartIgnore(lines, "d1", "Raw_Read_Error_Rate", true);
  expect(once.slice(-3)).toEqual(["smartignore * 194", "smartignore d1 Raw_Read_Error_Rate", ""]);

  const twice = editSmartIgnore(once, "d1", "Spin_Up_Time", true);
  expect(twice.at(-2)).toEqual("smartignore d1 Raw_Read_Error_Rate Spin_Up_Time");
  // SnapRAID compares names case-insensitively
  expect(editSmartIgnore(twice, "d1", "raw_read_error_rate", true)).toEqual(twice);

  const noRules = editSmartIgnore(["data d1 /mnt/disk1/", ""], "*", "Spin_Up_Time", true);
  expect(noRules).toEqual(["data d1 /mnt/disk1/", "smartignore * Spin_Up_Time", ""]);
});

test("editSmartIgnore - stops ignoring, the last attribute takes its line along", () => {
  const lines = ["smartignore d1 197 Raw_Read_Error_Rate", "smartignore * 194", ""];
  expect(editSmartIgnore(lines, "d1", "RAW_READ_ERROR_RATE", false)).toEqual(["smartignore d1 197", "smartignore * 194", ""]);
  expect(editSmartIgnore(lines, "*", "194", false)).toEqual(["smartignore d1 197 Raw_Read_Error_Rate", ""]);
  // Another disk's rule stays
  expect(editSmartIgnore(lines, "d2", "197", false)).toEqual(lines);
});

test("editSmartIgnore - refuses a fifth attribute, SnapRAID would refuse the config", () => {
  const lines = ["smartignore d1 1 7 10 Power_On_Hours", ""];
  assertThrows(() => editSmartIgnore(lines, "d1", "Load_Cycle_Count", true), SmartIgnoreFullError);
  // Taking one back makes room
  const three = editSmartIgnore(lines, "d1", "7", false);
  expect(editSmartIgnore(three, "d1", "Load_Cycle_Count", true)[0]).toEqual("smartignore d1 1 10 Power_On_Hours Load_Cycle_Count");
});

test("effectiveSmartIgnore - a later line overwrites the slots of an earlier one, like SnapRAID", () => {
  // SnapRAID 15 with these two lines ignores 12 and 9, and reports 5 again
  const rules = ["smartignore * 5 9", "smartignore * 12"].map((line) => parseSmartIgnoreLine(line)!);
  expect(effectiveSmartIgnore(rules)).toEqual([{ disk: "*", attributes: ["12", "9"] }]);
});

test("editSmartIgnore - merges a disk's lines into one with what SnapRAID applies", () => {
  const lines = ["smartignore * 5 9", "data d1 /mnt/disk1/", "smartignore * 12", ""];
  expect(editSmartIgnore(lines, "*", "5", true)).toEqual(["smartignore * 12 9 5", "data d1 /mnt/disk1/", ""]);
  expect(editSmartIgnore(lines, "*", "9", false)).toEqual(["smartignore * 12", "data d1 /mnt/disk1/", ""]);
  // 5 is not applied, so there is nothing to take back
  expect(editSmartIgnore(lines, "*", "5", false)).toEqual(lines);
});

test("isSmartIgnoreAttribute - what SnapRAID accepts", () => {
  for (const name of ["Raw_Read_Error_Rate", "Avg_Program/Erase_Ct", "DriveLife_Remaining%", "SSD_LifeLeft(0.01%)", "1", "255"]) {
    expect(isSmartIgnoreAttribute(name), name).toEqual(true);
  }
  for (const name of ["0", "256", "", "two words", "x".repeat(128)]) {
    expect(isSmartIgnoreAttribute(name), name).toEqual(false);
  }
});

test("parseSnapRaidConfig - smartignore rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const path = join(dir, "snapraid.conf");
    await writeFile(path, `${CONFIG}smartignore d1 Raw_Read_Error_Rate\nextra x1 /mnt/extra1/\nsmartignore * 199\n`);
    const parsed = await parseSnapRaidConfig(path);
    expect(parsed.smartIgnore).toEqual([
      { disk: "*", attributes: ["199"] },
      { disk: "d1", attributes: ["Raw_Read_Error_Rate"] },
    ]);
    expect(parsed.extra).toEqual({ x1: "/mnt/extra1/" });
  } finally {
    await rm(dir, { recursive: true });
  }
});
