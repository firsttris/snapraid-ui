import { assertEquals, assertStringIncludes } from "@std/assert";
import type { Schedule, SnapRaidStatus } from "@shared/types.ts";
import { renderMetrics } from "../metrics.ts";

const status = (changes: Partial<SnapRaidStatus> = {}): SnapRaidStatus => ({
  hasErrors: false,
  parityUpToDate: true,
  newFiles: 0,
  modifiedFiles: 0,
  deletedFiles: 0,
  disks: [],
  diskIssues: [],
  rawOutput: "",
  ...changes,
});

const schedule: Schedule = {
  id: "s1",
  name: "Nightly",
  command: "sync",
  configPath: "snapraid.conf",
  cronExpression: "0 3 * * *",
  enabled: true,
  nextRun: "2026-10-10T03:00:00.000Z",
  lastOutcome: { timestamp: "2026-10-09T03:00:00.000Z", result: "skipped", skipReason: "too_many_updated" },
  createdAt: "",
  updatedAt: "",
};

const lines = (text: string) => text.split("\n").filter((line) => line && !line.startsWith("#"));

Deno.test("renderMetrics - array, disks and schedules in Prometheus format", () => {
  const text = renderMetrics({
    job: null,
    schedules: [schedule],
    configs: [{
      name: "Media \"main\"",
      path: "/cfg/media.conf",
      lastRuns: {
        sync: { timestamp: "2026-10-09T03:10:00.000Z", result: "ok", logFile: "" },
        scrub: { timestamp: "2026-10-08T04:00:00.000Z", result: "error", logFile: "" },
      },
      status: {
        timestamp: "2026-10-09T08:00:00.000Z",
        status: status({
          badBlocks: 3,
          scrubPercentage: 42,
          oldestScrubDays: 12,
          diskIssues: [{ disk: "d2", type: "data", kind: "empty", path: "/mnt/d2/", files: 5 }],
        }),
      },
      usage: { date: "2026-10-09", usedGB: 3, freeGB: 7, disks: { d1: { usedGB: 1.5, freeGB: 2 } } },
      smart: { d1: { date: "2026-10-09", temperature: 38, reallocated: 0, crc: 4 }, d2: undefined },
    }],
  });

  assertStringIncludes(text, "# TYPE snapraid_bad_blocks gauge");
  const samples = lines(text);
  const label = 'config="Media \\"main\\""';
  for (
    const sample of [
      "snapraid_ui_up 1",
      "snapraid_job_running 0",
      `snapraid_last_sync_timestamp_seconds{${label}} 1791515400`,
      `snapraid_last_sync_success{${label}} 1`,
      `snapraid_last_scrub_success{${label}} 0`,
      `snapraid_bad_blocks{${label}} 3`,
      `snapraid_sync_incomplete{${label}} 0`,
      `snapraid_scrubbed_ratio{${label}} 0.42`,
      `snapraid_oldest_scrub_days{${label}} 12`,
      `snapraid_disks_unavailable{${label}} 1`,
      `snapraid_disk_used_bytes{${label},disk="d1"} 1500000000`,
      `snapraid_disk_temperature_celsius{${label},disk="d1"} 38`,
      `snapraid_disk_crc_errors{${label},disk="d1"} 4`,
      'snapraid_schedule_last_success{schedule="Nightly",command="sync"} 0',
      'snapraid_schedule_last_skipped{schedule="Nightly",command="sync"} 1',
      'snapraid_schedule_next_run_timestamp_seconds{schedule="Nightly",command="sync"} 1791601200',
    ]
  ) {
    assertEquals(samples.includes(sample), true, `missing: ${sample}\n${text}`);
  }
  // Values SMART did not report are left out, not reported as 0
  assertEquals(samples.some((sample) => sample.startsWith("snapraid_disk_pending_sectors")), false);
});

Deno.test("renderMetrics - without a status read yet, only what the logs know", () => {
  const text = renderMetrics({
    job: { command: "scrub", configPath: "/cfg/media.conf", startTime: "", processId: "p" },
    schedules: [],
    configs: [{ name: "Media", path: "/cfg/media.conf", lastRuns: { sync: null, scrub: null }, smart: {} }],
  });
  const samples = lines(text);
  assertEquals(samples, ["snapraid_ui_up 1", "snapraid_job_running 1", 'snapraid_job_info{command="scrub",config="Media"} 1']);
});
