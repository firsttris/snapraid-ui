import { assertEquals, assertMatch } from "@std/assert";
import { parseStatusOutput } from "../status-parser.ts";
import { parseDiffOutput } from "../diff-parser.ts";
import { parseListOutput } from "../list-parser.ts";
import { parseCheckOutput } from "../check-parser.ts";
import { parseSmartOutput } from "../smart-parser.ts";
import { parseProbeOutput } from "../probe-parser.ts";
import { parseLogTags, splitStructuredOutput, unescapeTagValue } from "../structured-log.ts";
import { parseParityLine } from "../../config-parser.ts";

// Fixtures are the stderr of `snapraid --log ">&2" <command>` (SnapRAID 14.9) on a demo array.
// smart.log and probe.log are hand written from the log_tag() calls in SnapRAID's device.c.
const fixture = (name: string): string =>
  Deno.readTextFileSync(new URL(`./fixtures/${name}`, import.meta.url));

Deno.test("structured-log - unescapes tag values", () => {
  assertEquals(unescapeTagValue("b\\drenamed.txt"), "b:renamed.txt");
  assertEquals(unescapeTagValue("a\\\\b\\nc"), "a\\b\nc");
});

Deno.test("structured-log - separates tags from text lines", () => {
  const { log, text } = splitStructuredOutput("summary:exit:ok\nLoading state from x...\nmsg:progress: Loading");
  assertEquals(log, "summary:exit:ok\nmsg:progress: Loading");
  assertEquals(text, "Loading state from x...");
  assertEquals(parseLogTags(log)[0], { name: "summary", values: ["exit", "ok"] });
});

Deno.test("parseStatusOutput - healthy array", () => {
  const status = parseStatusOutput(fixture("status.log"), "raw");

  assertEquals(status.hasErrors, false);
  assertEquals(status.parityUpToDate, true);
  assertEquals(status.syncInProgress, false);
  assertEquals(status.scrubPercentage, 0);
  assertEquals(status.oldestScrubDays, 0);
  assertEquals(status.totalFiles, 5);
  assertEquals(status.totalFreeGB, 14.7);
  assertEquals(status.freeSpaceGB, 14.7);
  assertEquals(status.equalFiles, undefined);
  assertEquals(status.disks!.map(d => [d.name, d.files, d.freeGB]), [["d1", 2, 7.3], ["d2", 3, 7.3]]);
  assertEquals(status.scrubHistory, [{ daysAgo: 0, percentage: 100 }]);
  assertEquals(status.rawOutput, "raw");
});

Deno.test("parseStatusOutput - bad blocks after scrub", () => {
  const status = parseStatusOutput(fixture("status-bad.log"));

  assertEquals(status.hasErrors, true);
  assertEquals(status.badBlocks, 1);
  assertEquals(status.parityUpToDate, false);
  // text report: "2% of the array is not scrubbed"
  assertEquals(status.scrubPercentage, 98);
});

Deno.test("parseStatusOutput - diff summary", () => {
  const status = parseStatusOutput(fixture("diff.log"));

  assertEquals(status.parityUpToDate, false);
  assertEquals(status.equalFiles, 5);
  assertEquals(status.newFiles, 1);
  assertEquals(status.modifiedFiles, 1);
  assertEquals(status.copiedFiles, 1);
});

Deno.test("parseDiffOutput - changes with copy and escaped names", () => {
  const diff = parseDiffOutput(fixture("diff.log"));

  assertEquals(diff.files, [
    { status: "copied", disk: "d1", name: "sub/c.dat -> c.dat" },
    { status: "updated", disk: "d2", name: "h.txt" },
    { status: "added", disk: "d2", name: "weird:name.txt" },
  ]);
  assertEquals(diff.equalFiles, 5);
  assertEquals(diff.copiedFiles, 1);
  assertEquals(diff.totalFiles, 8);
});

Deno.test("parseDiffOutput - added and removed files", () => {
  const diff = parseDiffOutput(fixture("diff-remove.log"));

  assertEquals(diff.newFiles, 3);
  assertEquals(diff.deletedFiles, 1);
  assertEquals(diff.files.find(f => f.status === "removed"), { status: "removed", disk: "d1", name: "b.txt" });
  assertEquals(diff.files.some(f => f.name === "new file.txt"), true);
});

Deno.test("parseListOutput - files from --gui-verbose tags", () => {
  const list = parseListOutput(fixture("list.log"));

  assertEquals(list.totalFiles, 5);
  assertEquals(list.totalSize, 4700015);
  assertEquals(list.totalLinks, 1);
  assertEquals(list.files.map(f => [f.disk, f.name, f.size]), [
    ["d1", "a.bin", 3000000],
    ["d1", "b:renamed.txt", 500000],
    ["d2", "h.txt", 11],
    ["d2", "new file.txt", 4],
    ["d2", "sub/c.dat", 1200000],
  ]);
  assertMatch(list.files[0].date, /^\d{4}\/\d{2}\/\d{2}$/);
  assertMatch(list.files[0].time, /^\d{2}:\d{2}$/);
});

Deno.test("parseCheckOutput - groups block errors per file", () => {
  const check = parseCheckOutput(fixture("check.log"));

  assertEquals(check.files, [
    { status: "ERROR", disk: "d1", name: "a.bin", error: "recoverable: Data error at position 1, diff hash bits 66/128" },
    { status: "ERROR", disk: "d1", name: "c-copy.dat", error: "recoverable: Open error at position 0. No such file or directory." },
  ]);
  // 19 soft errors + 1 data error
  assertEquals(check.errorCount, 20);
  assertEquals(check.okCount, 0);
});

Deno.test("parseCheckOutput - no errors", () => {
  const check = parseCheckOutput(fixture("check-ok.log"));

  assertEquals(check.files, []);
  assertEquals(check.errorCount, 0);
});

Deno.test("parseSmartOutput - disk status from smartctl flags", () => {
  const disks = parseSmartOutput(fixture("smart.log"));

  assertEquals(disks.map(d => [d.name, d.device, d.status]), [
    ["d1", "/dev/sda", "OK"],
    ["parity", "/dev/nvme0n1", "LOGERR"],
    ["d2", "/dev/sdb", "FAIL"],
    ["d3", "/dev/sdc", "UNKNOWN"],
  ]);
  assertEquals(disks[0].temperature, 36);
  assertEquals(disks[0].powerOnHours, 21873);
  assertEquals(disks[0].failureProbability, 4.46);
  assertEquals(disks[0].model, "WDC WD40EFRX-68N32N0");
  assertEquals(disks[0].size, "4.0 TB");
  assertEquals(disks[0].attributes!.length, 3);
  // only the lower 32 bits are the hours
  assertEquals(disks[2].powerOnHours, 21296);
  assertEquals(disks[2].attributes![0].flag, "prefail, failed now");
});

Deno.test("parseProbeOutput - power states", () => {
  assertEquals(parseProbeOutput(fixture("probe.log")), [
    { name: "d1", device: "/dev/sda", status: "Standby" },
    { name: "parity", device: "/dev/nvme0n1", status: "Active" },
    { name: "d2", device: "/dev/sdb", status: "Unknown" },
  ]);
});

Deno.test("parseParityLine - parity levels and split parity", () => {
  assertEquals(parseParityLine("parity /mnt/p1/snapraid.parity"), {
    level: 1, keyword: "parity", paths: ["/mnt/p1/snapraid.parity"],
  });
  assertEquals(parseParityLine("2-parity /mnt/a/2.parity, /mnt/b/2.parity"), {
    level: 2, keyword: "2-parity", paths: ["/mnt/a/2.parity", "/mnt/b/2.parity"],
  });
  assertEquals(parseParityLine("z-parity\t/mnt/z/z.parity")?.level, 3);
  assertEquals(parseParityLine("6-parity /mnt/p6/6.parity")?.level, 6);
  assertEquals(parseParityLine("7-parity /mnt/p7/7.parity"), null);
  assertEquals(parseParityLine("data d1 /mnt/d1"), null);
});
