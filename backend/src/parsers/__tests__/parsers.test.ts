import { assertEquals, assertMatch } from "@std/assert";
import { parseStatusOutput } from "../status-parser.ts";
import { parseDiffOutput } from "../diff-parser.ts";
import { parseListOutput } from "../list-parser.ts";
import { parseCheckOutput } from "../check-parser.ts";
import { parseDupOutput } from "../dup-parser.ts";
import { parseSmartArrayFailure, parseSmartOutput } from "../smart-parser.ts";
import { parseProbeOutput } from "../probe-parser.ts";
import { parseDfOutput } from "../df-parser.ts";
import { isLockedOutput, parseLogTags, splitStructuredOutput, unescapeTagValue } from "../structured-log.ts";
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

Deno.test("structured-log - detects a lock held by another SnapRAID instance", () => {
  // stderr of `status` while a sync is running (SnapRAID 14.9)
  const locked = "command:status\nmsg:fatal: The lock file '/p/snapraid.content.lock' is already in use!\nmsg:fatal: SnapRAID is already in use!";

  assertEquals(isLockedOutput(locked), true);
  assertEquals(isLockedOutput(fixture("status-bad.log")), false);
});

Deno.test("parseStatusOutput - healthy array", () => {
  const status = parseStatusOutput(fixture("status.log"), "raw");

  assertEquals(status.hasErrors, false);
  assertEquals(status.parityUpToDate, true);
  assertEquals(status.syncIncomplete, false);
  assertEquals(status.unsyncedBlocks, 0);
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
  assertEquals(disks[2].attributes![0].whenFailed, "now");
  assertEquals(disks[0].attributes![0].whenFailed, undefined);
});

Deno.test("parseSmartOutput - drive details, SSD wear and error counters", () => {
  const [hdd, ssd] = parseSmartOutput(fixture("smart.log"));

  assertEquals([hdd.family, hdd.interface, hdd.rotationRate], ["Western Digital Red", "SATA", 5400]);
  assertEquals([ssd.interface, ssd.rotationRate, ssd.wearLevel], ["NVMe", 0, 3]);
  assertEquals([ssd.errorProtocol, ssd.errorMedium], [1479, 0]);
  assertEquals(hdd.wearLevel, undefined);
});

Deno.test("parseSmartArrayFailure - probability of at least one failure", () => {
  assertEquals(parseSmartArrayFailure(fixture("smart.log")), 43.2);
  assertEquals(parseSmartArrayFailure("info:/dev/sda:d1"), undefined);
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

Deno.test("parseDfOutput - size, free space and mount point", () => {
  const output = "     1B-blocks         Avail Mounted on\n4000787030016 1234567890123 /mnt/parity 1\n";
  assertEquals(parseDfOutput(output), { totalBytes: 4000787030016, freeBytes: 1234567890123, mount: "/mnt/parity 1" });
  assertEquals(parseDfOutput("df: /missing: No such file or directory\n"), null);
});

Deno.test("parseDupOutput - duplicate pairs with escaped paths", () => {
  const { duplicates, totalSize } = parseDupOutput(fixture("dup.log"));

  assertEquals(duplicates, [
    { disk: "d1", name: "documents/contract-backup.pdf", originalDisk: "d1", originalName: "documents/contract.pdf", size: 122880 },
    { disk: "d3", name: "projects/copy of: contract.pdf", originalDisk: "d1", originalName: "documents/contract.pdf", size: 122880 },
  ]);
  assertEquals(totalSize, 245760);
});

Deno.test("parseStatusOutput - files without sub-second timestamp", () => {
  const status = parseStatusOutput("summary:disk_zerosubsecond_file_count:d3:1\nsummary:zerosubsecond_file_count:1");
  assertEquals(status.zeroSubsecondFiles, 1);
  assertEquals(parseStatusOutput(fixture("status.log")).zeroSubsecondFiles, 0);
});

Deno.test("parseSmartOutput - a sleeping disk is reported as standby, not woken up", () => {
  const [disk] = parseSmartOutput("info:/dev/sdc:d3\nattr:/dev/sdc:d3:power:standby");
  assertEquals([disk.name, disk.status, disk.standby], ["d3", "UNKNOWN", true]);
});
