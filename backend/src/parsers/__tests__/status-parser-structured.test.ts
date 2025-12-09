import { assertEquals } from "@std/assert";
import { parseStatusOutput } from "../status-parser-structured.ts";

Deno.test("parseStatusOutput - parses snapraid structured status output correctly", async () => {
  const content = await Deno.readTextFile("/home/tristan/Projects/snapraid/docs/snapraid-status-structured-pr.txt");
  const lines = content.split('\n');
  const input = lines.slice(1).join('\n'); // Remove the first line (command)

  const status = parseStatusOutput(input);

  // Assertions based on the expected output
  assertEquals(status.hasErrors, false);
  assertEquals(status.parityUpToDate, true);
  assertEquals(status.newFiles, 0);
  assertEquals(status.modifiedFiles, 0);
  assertEquals(status.deletedFiles, 0);
  assertEquals(status.equalFiles, undefined);
  assertEquals(status.movedFiles, undefined);
  assertEquals(status.copiedFiles, undefined);
  assertEquals(status.restoredFiles, undefined);
  assertEquals(status.scrubPercentage, 0);
  assertEquals(status.syncInProgress, false);
  assertEquals(status.oldestScrubDays, 3);
  assertEquals(status.medianScrubDays, 3);
  assertEquals(status.newestScrubDays, 1);
  assertEquals(status.fragmentedFiles, 1);
  assertEquals(status.wastedGB, 499);
  assertEquals(status.freeSpaceGB, 209);
  assertEquals(status.totalFiles, 22);
  assertEquals(status.totalUsedGB, 0);
  assertEquals(status.totalFreeGB, 209);
  assertEquals(status.disks!.length, 2);
  assertEquals(status.disks![0].name, "test1");
  assertEquals(status.disks![0].files, 22);
  assertEquals(status.disks![0].fragmentedFiles, 1);
  assertEquals(status.disks![0].excessFragments, 1);
  assertEquals(status.disks![0].wastedGB, 499.8);
  assertEquals(status.disks![0].usedGB, 0);
  assertEquals(status.disks![0].freeGB, 209);
  assertEquals(status.disks![0].usePercent, 0);
  assertEquals(status.disks![1].name, "test2");
  assertEquals(status.disks![1].files, 0);
  assertEquals(status.disks![1].fragmentedFiles, 0);
  assertEquals(status.disks![1].excessFragments, 0);
  assertEquals(status.disks![1].wastedGB, 0);
  assertEquals(status.disks![1].usedGB, 0);
  assertEquals(status.disks![1].freeGB, 0);
  assertEquals(status.disks![1].usePercent, 0);
  assertEquals(Array.isArray(status.scrubHistory), true);
  assertEquals(status.rawOutput, input);
});