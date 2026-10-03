import { assertEquals } from "@std/assert";
import type { SnapRaidStatus } from "@shared/types.ts";
import { forecastFill } from "@shared/usage-forecast.ts";
import { addUsagePoint } from "../usage-history.ts";

const status = (freeGB: number): SnapRaidStatus => ({
  totalUsedGB: 1000 - freeGB,
  totalFreeGB: freeGB,
  disks: [{ name: "d1", files: 1, fragmentedFiles: 0, excessFragments: 0, wastedGB: 0, usedGB: 1000 - freeGB, freeGB, usePercent: 50 }],
} as SnapRaidStatus);

Deno.test("addUsagePoint - one point per day and config", () => {
  const first = addUsagePoint("/c.conf", status(500), {}, new Date("2026-01-01T08:00:00Z"));
  const again = addUsagePoint("/c.conf", status(490), first, new Date("2026-01-01T20:00:00Z"));
  const next = addUsagePoint("/c.conf", status(480), again, new Date("2026-01-02T08:00:00Z"));

  assertEquals(next["/c.conf"].map((point) => [point.date, point.freeGB, point.disks.d1.freeGB]), [
    ["2026-01-01", 490, 490],
    ["2026-01-02", 480, 480],
  ]);
});

Deno.test("addUsagePoint - a status without usage adds nothing", () => {
  const state = {};
  assertEquals(addUsagePoint("/c.conf", {} as SnapRaidStatus, state), state);
});

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

Deno.test("forecastFill - steady growth gives the days until full", () => {
  // 10 GB less free space per day, 300 GB left
  const points = Array.from({ length: 31 }, (_, i) => ({ date: day(i), freeGB: 600 - i * 10 }));
  assertEquals(forecastFill(points), { gbPerMonth: 300, daysUntilFull: 30 });
});

Deno.test("forecastFill - no forecast without growth or enough days", () => {
  assertEquals(forecastFill([{ date: day(0), freeGB: 100 }, { date: day(3), freeGB: 50 }]), undefined);
  const shrinking = Array.from({ length: 31 }, (_, i) => ({ date: day(i), freeGB: 100 + i }));
  assertEquals(forecastFill(shrinking)?.daysUntilFull, undefined);
});
