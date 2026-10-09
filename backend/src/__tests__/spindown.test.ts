import { assertEquals } from "@std/assert";
import type { DeviceInfo } from "@shared/types.ts";
import { parseDiskstats, updateWatchedDisks, type WatchedDisk } from "../spindown.ts";

const stats = (sda1: string, sdb: string) =>
  parseDiskstats([
    `   8       0 sda 900 0 9000 10 500 0 5000 10 0 0 0 0 0 0 0 0 0`,
    `   8       1 sda1 ${sda1.split("/")[0]} 0 1 1 ${sda1.split("/")[1]} 0 1 1 0 0 0 0 0 0 0 0 0`,
    `   8      16 sdb ${sdb.split("/")[0]} 0 1 1 ${sdb.split("/")[1]} 0 1 1 0 0 0 0 0 0 0 0 0`,
  ].join("\n"));

const devices: Array<{ configPath: string; devices: DeviceInfo[] }> = [{
  configPath: "/c.conf",
  devices: [
    // A data disk with a partition, its counters are the partition's
    { majorMinor: "8:0", device: "/dev/sda", partMajorMinor: "8:1", partition: "/dev/sda1", diskName: "d1" },
    // A parity disk formatted without a partition table
    { majorMinor: "8:16", device: "/dev/sdb", partMajorMinor: "8:16", partition: "/dev/sdb", diskName: "parity" },
  ],
}];

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
const IDLE = 30 * 60_000;

const run = (previous: Map<string, WatchedDisk>, sda1: string, sdb: string, minutes: number) =>
  updateWatchedDisks(previous, devices, stats(sda1, sdb), at(minutes), IDLE);

Deno.test("parseDiskstats - reads and writes completed by major:minor", () => {
  assertEquals(stats("10/20", "30/40").get("8:1"), "10/20");
  assertEquals(stats("10/20", "30/40").get("8:0"), "900/500");
});

Deno.test("updateWatchedDisks - spins a disk down once after the idle time", () => {
  const first = run(new Map(), "10/20", "30/40", 0);
  assertEquals(first.idle, []);

  // The parity is written to, the data disk stays quiet
  const later = run(first.disks, "10/20", "31/40", 20);
  assertEquals(later.idle, []);

  const idle = run(later.disks, "10/20", "31/40", 30);
  assertEquals(idle.idle.map((disk) => disk.disk), ["d1"]);

  // Marked as spun down, it is not sent to sleep again every minute
  idle.disks.get("/c.conf|d1")!.spunDownAt = at(30).toISOString();
  assertEquals(run(idle.disks, "10/20", "31/40", 31).idle, []);

  // The parity reaches its idle time half an hour after its last write
  assertEquals(run(idle.disks, "10/20", "31/40", 50).idle.map((disk) => disk.disk), ["parity"]);
});

Deno.test("updateWatchedDisks - activity on the partition wakes the disk, whole-disk I/O does not count", () => {
  const first = run(new Map(), "10/20", "30/40", 0);
  first.disks.get("/c.conf|d1")!.spunDownAt = at(0).toISOString();

  // Only the whole-disk line of sda changes (SMART, probe), the partition does not
  const smart = updateWatchedDisks(
    first.disks,
    devices,
    new Map([...stats("10/20", "30/40"), ["8:0", "999/999"]]),
    at(5),
    IDLE,
  );
  assertEquals(smart.disks.get("/c.conf|d1")?.spunDownAt, at(0).toISOString());

  const woken = run(smart.disks, "11/20", "30/40", 10);
  assertEquals(woken.disks.get("/c.conf|d1")?.spunDownAt, undefined);
  assertEquals(woken.disks.get("/c.conf|d1")?.lastActivity, at(10).toISOString());
});

Deno.test("updateWatchedDisks - disks without counters are not watched", () => {
  const result = updateWatchedDisks(new Map(), devices, new Map(), at(0), IDLE);
  assertEquals(result.disks.size, 0);
});
