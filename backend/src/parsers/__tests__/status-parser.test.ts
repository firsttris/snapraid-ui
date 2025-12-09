import { assertEquals } from "@std/assert";
import { parseStatusOutput } from "../status-parser.ts";

Deno.test("parseStatusOutput - parses snapraid status output correctly", async () => {
  const content = await Deno.readTextFile("/home/tristan/Projects/snapraid/docs/snapraid-status.txt");
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
  assertEquals(status.oldestScrubDays, 0);
  assertEquals(status.medianScrubDays, 0);
  assertEquals(status.newestScrubDays, 0);
  assertEquals(status.fragmentedFiles, 0);
  assertEquals(status.wastedGB, 502.5);
  assertEquals(status.freeSpaceGB, 209);
  assertEquals(status.totalFiles, 13);
  assertEquals(status.totalUsedGB, 0);
  assertEquals(status.totalFreeGB, 209);
  assertEquals(status.disks!.length, 2);
  assertEquals(status.disks![0].name, "test1");
  assertEquals(status.disks![0].files, 13);
  assertEquals(status.disks![0].fragmentedFiles, 0);
  assertEquals(status.disks![0].wastedGB, 502.5);
  assertEquals(status.disks![0].usedGB, 0);
  assertEquals(status.disks![0].freeGB, 209);
  assertEquals(status.disks![0].usePercent, 0);
  assertEquals(status.disks![1].name, "test2");
  assertEquals(status.disks![1].files, 0);
  assertEquals(status.disks![1].fragmentedFiles, 0);
  assertEquals(status.disks![1].wastedGB, 0);
  assertEquals(status.disks![1].usedGB, 0);
  assertEquals(status.disks![1].freeGB, 0);
  assertEquals(status.disks![1].usePercent, 0);
  console.log('status.scrubHistory:', status.scrubHistory);
  assertEquals(Array.isArray(status.scrubHistory), true);
  assertEquals(status.rawOutput, input);
});