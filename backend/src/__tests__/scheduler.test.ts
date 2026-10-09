import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import type { Schedule, ScheduleConfig } from "@shared/types.ts";
import { createScheduler, executeScheduledCommand } from "../scheduler.ts";
import { createFakeEngine, type FakeEngineOptions } from "./fake-engine.ts";

const schedule = (changes: Partial<Schedule> = {}): Schedule => ({
  id: "nightly",
  name: "Nightly",
  command: "sync",
  configPath: "/fake/snapraid.conf",
  cronExpression: "0 3 * * *",
  enabled: true,
  maxDeletedFiles: 50,
  touchBefore: true,
  scrubAfter: ["-p", "8"],
  createdAt: "",
  updatedAt: "",
  ...changes,
});

/**
 * Run the schedule once against a fake engine; the jobs it ran and its stored outcome
 */
const runOnce = async (options: FakeEngineOptions, changes: Partial<Schedule> = {}, busy = false) => {
  const dir = await Deno.makeTempDir();
  const path = join(dir, "schedules.json");
  try {
    await Deno.writeTextFile(path, JSON.stringify({ schedules: [schedule(changes)] }));
    const engine = createFakeEngine(options);
    engine.setBusy(busy);
    await executeScheduledCommand(path, engine, undefined, "nightly");
    const stored = JSON.parse(await Deno.readTextFile(path)) as ScheduleConfig;
    return { jobs: engine.jobs, outcome: stored.schedules[0].lastOutcome };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test("scheduler - the nightly routine runs touch, sync and scrub", async () => {
  const { jobs, outcome } = await runOnce({});
  assertEquals(jobs, ["touch", "sync", "scrub -p 8"]);
  assertEquals(outcome?.result, "ok");
  assertEquals(outcome?.steps?.map((step) => step.command), ["touch", "sync", "scrub"]);
});

Deno.test("scheduler - a failed sync stops the routine before the scrub", async () => {
  const { jobs, outcome } = await runOnce({ results: { sync: "error" } });
  assertEquals(jobs, ["touch", "sync"]);
  assertEquals(outcome?.result, "error");
});

Deno.test("scheduler - a missing disk skips the run before anything starts", async () => {
  const { jobs, outcome } = await runOnce({
    diskIssues: [{ disk: "d2", type: "data", kind: "empty", path: "/mnt/disk2/", files: 10 }],
  });
  assertEquals(jobs, []);
  assertEquals(outcome?.skipReason, "disk_missing");
  assertEquals(outcome?.disks, ["d2"]);
});

Deno.test("scheduler - a changed filesystem does not stop the run", async () => {
  const { jobs } = await runOnce({
    diskIssues: [{ disk: "d2", type: "data", kind: "uuid_changed", path: "/mnt/disk2/" }],
  });
  assertEquals(jobs, ["touch", "sync", "scrub -p 8"]);
});

Deno.test("scheduler - the sync guard skips a sync with too many deletions", async () => {
  const { jobs, outcome } = await runOnce({ deletedFiles: 51 });
  assertEquals(jobs, []);
  assertEquals(outcome?.skipReason, "too_many_deleted");
  assertEquals(outcome?.deletedFiles, 51);
});

Deno.test("scheduler - SnapRAID locked by another process: the disk check steps aside, the run goes on", async () => {
  const { jobs } = await runOnce({}, { maxDeletedFiles: null }, true);
  assertEquals(jobs, ["touch", "sync", "scrub -p 8"]);
});

Deno.test("scheduler - a scrub schedule does not run the sync guard", async () => {
  const { jobs } = await runOnce({ deletedFiles: 999 }, { command: "scrub", args: ["-p", "new"] });
  assertEquals(jobs, ["scrub -p new"]);
});

Deno.test("scheduler - run now runs the routine once, not while a job runs", async () => {
  const dir = await Deno.makeTempDir();
  const path = join(dir, "schedules.json");
  try {
    // Disabled: run now works without the cron
    await Deno.writeTextFile(path, JSON.stringify({ schedules: [schedule({ enabled: false })] }));
    const engine = createFakeEngine();
    const scheduler = createScheduler(path, engine);

    const { done } = await scheduler.runNow("nightly");
    await done;
    assertEquals(engine.jobs, ["touch", "sync", "scrub -p 8"]);

    await assertRejects(() => scheduler.runNow("unknown"));
    await engine.runJob({
      command: "sync",
      configPath: "/fake/snapraid.conf",
      afterRun: async () => {
        await assertRejects(() => scheduler.runNow("nightly"));
      },
    });
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
