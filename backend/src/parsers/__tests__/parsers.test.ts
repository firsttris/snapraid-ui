import { expect, test } from "bun:test";
import { parseStatusOutput } from "../status-parser.ts";
import { parseDiffOutput } from "../diff-parser.ts";
import { parseListOutput } from "../list-parser.ts";
import { parseCheckOutput } from "../check-parser.ts";
import { parseDupOutput } from "../dup-parser.ts";
import { parseSmartArrayFailure, parseSmartOutput } from "../smart-parser.ts";
import { parseDegradedDisks, parseProbeOutput } from "../probe-parser.ts";
import { parseDfOutput } from "../df-parser.ts";
import { isLockedOutput, parseLogTags, splitStructuredOutput, unescapeTagValue } from "../structured-log.ts";
import { parseParityLine } from "../../config-parser.ts";
import { readFileSync } from "node:fs";

// Fixtures are the stderr of `snapraid --log ">&2" <command>` (SnapRAID 14.9) on a demo array.
// smart.log and probe.log are hand written from the log_tag() calls in SnapRAID's device.c.
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("structured-log - unescapes tag values", () => {
  expect(unescapeTagValue("b\\drenamed.txt")).toEqual("b:renamed.txt");
  expect(unescapeTagValue("a\\\\b\\nc")).toEqual("a\\b\nc");
});

test("structured-log - separates tags from text lines", () => {
  const { log, text } = splitStructuredOutput("summary:exit:ok\nLoading state from x...\nmsg:progress: Loading");
  expect(log).toEqual("summary:exit:ok\nmsg:progress: Loading");
  expect(text).toEqual("Loading state from x...");
  expect(parseLogTags(log)[0]).toEqual({ name: "summary", values: ["exit", "ok"] });
});

test("structured-log - detects a lock held by another SnapRAID instance", () => {
  // stderr of `status` while a sync is running (SnapRAID 14.9)
  const locked = "command:status\nmsg:fatal: The lock file '/p/snapraid.content.lock' is already in use!\nmsg:fatal: SnapRAID is already in use!";

  expect(isLockedOutput(locked)).toEqual(true);
  expect(isLockedOutput(fixture("status-bad.log"))).toEqual(false);
});

test("parseStatusOutput - healthy array", () => {
  const status = parseStatusOutput(fixture("status.log"), "raw");

  expect(status.hasErrors).toEqual(false);
  expect(status.parityUpToDate).toEqual(true);
  expect(status.syncIncomplete).toEqual(false);
  expect(status.unsyncedBlocks).toEqual(0);
  expect(status.scrubPercentage).toEqual(0);
  expect(status.oldestScrubDays).toEqual(0);
  expect(status.totalFiles).toEqual(5);
  expect(status.totalFreeGB).toEqual(14.7);
  expect(status.freeSpaceGB).toEqual(14.7);
  expect(status.equalFiles).toEqual(undefined);
  expect(status.disks!.map(d => [d.name, d.files, d.freeGB])).toEqual([["d1", 2, 7.3], ["d2", 3, 7.3]]);
  expect(status.scrubHistory).toEqual([{ daysAgo: 0, percentage: 100 }]);
  expect(status.rawOutput).toEqual("raw");
});

test("parseStatusOutput - bad blocks after scrub", () => {
  const status = parseStatusOutput(fixture("status-bad.log"));

  expect(status.hasErrors).toEqual(true);
  expect(status.badBlocks).toEqual(1);
  expect(status.parityUpToDate).toEqual(false);
  // text report: "2% of the array is not scrubbed"
  expect(status.scrubPercentage).toEqual(98);
});

test("parseStatusOutput - diff summary", () => {
  const status = parseStatusOutput(fixture("diff.log"));

  expect(status.parityUpToDate).toEqual(false);
  expect(status.equalFiles).toEqual(5);
  expect(status.newFiles).toEqual(1);
  expect(status.modifiedFiles).toEqual(1);
  expect(status.copiedFiles).toEqual(1);
});

test("parseDiffOutput - changes with copy and escaped names", () => {
  const diff = parseDiffOutput(fixture("diff.log"));

  expect(diff.files).toEqual([
    { status: "copied", disk: "d1", name: "sub/c.dat -> c.dat" },
    { status: "updated", disk: "d2", name: "h.txt" },
    { status: "added", disk: "d2", name: "weird:name.txt" },
  ]);
  expect(diff.equalFiles).toEqual(5);
  expect(diff.copiedFiles).toEqual(1);
  expect(diff.totalFiles).toEqual(8);
});

test("parseDiffOutput - added and removed files", () => {
  const diff = parseDiffOutput(fixture("diff-remove.log"));

  expect(diff.newFiles).toEqual(3);
  expect(diff.deletedFiles).toEqual(1);
  expect(diff.files.find(f => f.status === "removed")).toEqual({ status: "removed", disk: "d1", name: "b.txt" });
  expect(diff.files.some(f => f.name === "new file.txt")).toEqual(true);
});

test("parseListOutput - files from --gui-verbose tags", () => {
  const list = parseListOutput(fixture("list.log"));

  expect(list.totalFiles).toEqual(5);
  expect(list.totalSize).toEqual(4700015);
  expect(list.totalLinks).toEqual(1);
  expect(list.files.map(f => [f.disk, f.name, f.size])).toEqual([
    ["d1", "a.bin", 3000000],
    ["d1", "b:renamed.txt", 500000],
    ["d2", "h.txt", 11],
    ["d2", "new file.txt", 4],
    ["d2", "sub/c.dat", 1200000],
  ]);
  expect(list.files[0].date).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  expect(list.files[0].time).toMatch(/^\d{2}:\d{2}$/);
});

test("parseCheckOutput - groups block errors per file", () => {
  const check = parseCheckOutput(fixture("check.log"));

  expect(check.files).toEqual([
    { status: "ERROR", disk: "d1", name: "a.bin", error: "recoverable: Data error at position 1, diff hash bits 66/128" },
    { status: "ERROR", disk: "d1", name: "c-copy.dat", error: "recoverable: Open error at position 0. No such file or directory." },
  ]);
  // 19 soft errors + 1 data error
  expect(check.errorCount).toEqual(20);
  expect(check.okCount).toEqual(0);
});

test("parseCheckOutput - data errors tagged by SnapRAID 15", () => {
  // SnapRAID 15.0 tags silent data errors error_data and parity_error_data (14: error, parity_error)
  const check = parseCheckOutput([
    "version:15.0",
    "error_data:15:disk1:photos/2024/holiday-002.jpg: Data error at position 0, diff hash bits 72/128",
    "unrecoverable:15:disk1:photos/2024/holiday-002.jpg: Unrecoverable error at position 0",
    "parity_error_data:1:parity: Data error, diff parity bits 71/524288",
    "status:unrecoverable:disk1:photos/2024/holiday-002.jpg",
    "summary:error_soft:0",
    "summary:error_io:0",
    "summary:error_data:2",
    "summary:exit:unrecoverable",
  ].join("\n"));

  expect(check.files).toEqual([
    { status: "ERROR", disk: "disk1", name: "photos/2024/holiday-002.jpg", error: "unrecoverable: Data error at position 0, diff hash bits 72/128" },
    { status: "ERROR", disk: "parity", name: "parity", error: "Data error, diff parity bits 71/524288" },
  ]);
  expect(check.errorCount).toEqual(2);
});

test("parseCheckOutput - no errors", () => {
  const check = parseCheckOutput(fixture("check-ok.log"));

  expect(check.files).toEqual([]);
  expect(check.errorCount).toEqual(0);
  expect(check.rehashCount).toEqual(0);
});

test("parseCheckOutput - rehash blocks from the content file", () => {
  const check = parseCheckOutput(fixture("check-ok.log").replace("content_info:block_rehash:0", "content_info:block_rehash:42"));

  expect(check.rehashCount).toEqual(42);
});

test("parseSmartOutput - disk status from smartctl flags", () => {
  const disks = parseSmartOutput(fixture("smart.log"));

  expect(disks.map(d => [d.name, d.device, d.status])).toEqual([
    ["d1", "/dev/sda", "OK"],
    ["parity", "/dev/nvme0n1", "LOGERR"],
    ["d2", "/dev/sdb", "FAIL"],
    ["d3", "/dev/sdc", "UNKNOWN"],
  ]);
  expect(disks[0].temperature).toEqual(36);
  expect(disks[0].powerOnHours).toEqual(21873);
  expect(disks[0].failureProbability).toEqual(4.46);
  expect(disks[0].model).toEqual("WDC WD40EFRX-68N32N0");
  expect(disks[0].size).toEqual("4.0 TB");
  expect(disks[0].attributes!.length).toEqual(3);
  // only the lower 32 bits are the hours
  expect(disks[2].powerOnHours).toEqual(21296);
  expect(disks[2].attributes![0].flag).toEqual("prefail, failed now");
  expect(disks[2].attributes![0].whenFailed).toEqual("now");
  expect(disks[0].attributes![0].whenFailed).toEqual(undefined);
});

test("parseSmartOutput - drive details, SSD wear and error counters", () => {
  const [hdd, ssd] = parseSmartOutput(fixture("smart.log"));

  expect([hdd.family, hdd.interface, hdd.rotationRate]).toEqual(["Western Digital Red", "SATA", 5400]);
  expect([ssd.interface, ssd.rotationRate, ssd.wearLevel]).toEqual(["NVMe", 0, 3]);
  expect([ssd.errorProtocol, ssd.errorMedium]).toEqual([1479, 0]);
  expect(hdd.wearLevel).toEqual(undefined);
});

test("parseSmartArrayFailure - probability of at least one failure", () => {
  expect(parseSmartArrayFailure(fixture("smart.log"))).toEqual(43.2);
  expect(parseSmartArrayFailure("info:/dev/sda:d1")).toEqual(undefined);
});

test("parseDegradedDisks - disks on a filesystem with a missing device (SnapRAID 15)", () => {
  const log = [
    "msg:error: DANGER! Disk 'd2' is degraded due to missing device(s).",
    "degraded:d2",
    "degraded:parity",
    "degraded:d2",
    "probe:/dev/sda:d1:1",
  ].join("\n");
  expect(parseDegradedDisks(log)).toEqual(["d2", "parity"]);
  expect(parseDegradedDisks(fixture("probe.log"))).toEqual([]);
});

test("parseProbeOutput - power states", () => {
  expect(parseProbeOutput(fixture("probe.log"))).toEqual([
    { name: "d1", device: "/dev/sda", status: "Standby" },
    { name: "parity", device: "/dev/nvme0n1", status: "Active" },
    { name: "d2", device: "/dev/sdb", status: "Unknown" },
  ]);
});

test("parseParityLine - parity levels and split parity", () => {
  expect(parseParityLine("parity /mnt/p1/snapraid.parity")).toEqual({
    level: 1, keyword: "parity", paths: ["/mnt/p1/snapraid.parity"],
  });
  expect(parseParityLine("2-parity /mnt/a/2.parity, /mnt/b/2.parity")).toEqual({
    level: 2, keyword: "2-parity", paths: ["/mnt/a/2.parity", "/mnt/b/2.parity"],
  });
  expect(parseParityLine("z-parity\t/mnt/z/z.parity")?.level).toEqual(3);
  expect(parseParityLine("6-parity /mnt/p6/6.parity")?.level).toEqual(6);
  expect(parseParityLine("7-parity /mnt/p7/7.parity")).toEqual(null);
  expect(parseParityLine("data d1 /mnt/d1")).toEqual(null);
});

test("parseDfOutput - size, free space and mount point", () => {
  const output = "     1B-blocks         Avail Mounted on\n4000787030016 1234567890123 /mnt/parity 1\n";
  expect(parseDfOutput(output)).toEqual({ totalBytes: 4000787030016, freeBytes: 1234567890123, mount: "/mnt/parity 1" });
  expect(parseDfOutput("df: /missing: No such file or directory\n")).toEqual(null);
});

test("parseDupOutput - duplicate pairs with escaped paths", () => {
  const { duplicates, totalSize } = parseDupOutput(fixture("dup.log"));

  expect(duplicates).toEqual([
    { disk: "d1", name: "documents/contract-backup.pdf", originalDisk: "d1", originalName: "documents/contract.pdf", size: 122880 },
    { disk: "d3", name: "projects/copy of: contract.pdf", originalDisk: "d1", originalName: "documents/contract.pdf", size: 122880 },
  ]);
  expect(totalSize).toEqual(245760);
});

test("parseStatusOutput - files without sub-second timestamp", () => {
  const status = parseStatusOutput("summary:disk_zerosubsecond_file_count:d3:1\nsummary:zerosubsecond_file_count:1");
  expect(status.zeroSubsecondFiles).toEqual(1);
  expect(parseStatusOutput(fixture("status.log")).zeroSubsecondFiles).toEqual(0);
});

test("parseSmartOutput - a sleeping disk is reported as standby, not woken up", () => {
  const [disk] = parseSmartOutput("info:/dev/sdc:d3\nattr:/dev/sdc:d3:power:standby");
  expect([disk.name, disk.status, disk.standby]).toEqual(["d3", "UNKNOWN", true]);
});
