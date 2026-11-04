import { expect, test } from "bun:test";
import { assertRejects } from "../../__tests__/assert-error.ts";
import { join } from "node:path";
import type { Schedule, ScheduleConfig } from "@shared/types.ts";
import { createScheduler, executeScheduledCommand } from "../scheduler.ts";
import { createFakeEngine, type FakeEngineOptions } from "../../engine/__tests__/fake-engine.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

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
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  const path = join(dir, "schedules.json");
  try {
    await writeFile(path, JSON.stringify({ schedules: [schedule(changes)] }));
    const engine = createFakeEngine(options);
    engine.setBusy(busy);
    await executeScheduledCommand(path, engine, undefined, "nightly");
    const stored = JSON.parse(await readFile(path, "utf8")) as ScheduleConfig;
    return { jobs: engine.jobs, outcome: stored.schedules[0].lastOutcome };
  } finally {
    await rm(dir, { recursive: true });
  }
};

test("scheduler - the nightly routine runs touch, sync and scrub", async () => {
  const { jobs, outcome } = await runOnce({});
  expect(jobs).toEqual(["touch", "sync", "scrub -p 8"]);
  expect(outcome?.result).toEqual("ok");
  expect(outcome?.steps?.map((step) => step.command)).toEqual(["touch", "sync", "scrub"]);
});

test("scheduler - a failed sync stops the routine before the scrub", async () => {
  const { jobs, outcome } = await runOnce({ results: { sync: "error" } });
  expect(jobs).toEqual(["touch", "sync"]);
  expect(outcome?.result).toEqual("error");
});

test("scheduler - a missing disk skips the run before anything starts", async () => {
  const { jobs, outcome } = await runOnce({
    diskIssues: [{ disk: "d2", type: "data", kind: "empty", path: "/mnt/disk2/", files: 10 }],
  });
  expect(jobs).toEqual([]);
  expect(outcome?.skipReason).toEqual("disk_missing");
  expect(outcome?.disks).toEqual(["d2"]);
});

test("scheduler - a changed filesystem does not stop the run", async () => {
  const { jobs } = await runOnce({
    diskIssues: [{ disk: "d2", type: "data", kind: "uuid_changed", path: "/mnt/disk2/" }],
  });
  expect(jobs).toEqual(["touch", "sync", "scrub -p 8"]);
});

test("scheduler - the sync guard skips a sync with too many deletions", async () => {
  const { jobs, outcome } = await runOnce({ deletedFiles: 51 });
  expect(jobs).toEqual([]);
  expect(outcome?.skipReason).toEqual("too_many_deleted");
  expect(outcome?.deletedFiles).toEqual(51);
  expect(outcome?.limit).toEqual(50);
});

test("scheduler - the sync guard skips a sync with too many updated files", async () => {
  const { jobs, outcome } = await runOnce({ updatedFiles: 101 }, { maxUpdatedFiles: 100 });
  expect(jobs).toEqual([]);
  expect(outcome?.skipReason).toEqual("too_many_updated");
  expect(outcome?.updatedFiles).toEqual(101);
  expect(outcome?.limit).toEqual(100);
});

test("scheduler - updated files are not checked without a limit, as in older schedules", async () => {
  const { jobs } = await runOnce({ updatedFiles: 5000 });
  expect(jobs).toEqual(["touch", "sync", "scrub -p 8"]);
});

test("scheduler - skip next skips one timed run, run now still runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  const path = join(dir, "schedules.json");
  const stored = async () => (JSON.parse(await readFile(path, "utf8")) as ScheduleConfig).schedules[0];
  try {
    await writeFile(path, JSON.stringify({ schedules: [schedule({ skipNext: true })] }));
    const engine = createFakeEngine();

    await executeScheduledCommand(path, engine, undefined, "nightly", { manual: true });
    expect(engine.jobs).toEqual(["touch", "sync", "scrub -p 8"]);
    expect((await stored()).skipNext).toEqual(true);

    await executeScheduledCommand(path, engine, undefined, "nightly");
    expect(engine.jobs.length).toEqual(3);
    expect((await stored()).skipNext).toEqual(false);
    expect((await stored()).lastOutcome?.skipReason).toEqual("skipped_once");

    await executeScheduledCommand(path, engine, undefined, "nightly");
    expect(engine.jobs.length).toEqual(6);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("scheduler - SnapRAID locked by another process: the disk check steps aside, the run goes on", async () => {
  const { jobs } = await runOnce({}, { maxDeletedFiles: null }, true);
  expect(jobs).toEqual(["touch", "sync", "scrub -p 8"]);
});

test("scheduler - a scrub schedule does not run the sync guard", async () => {
  const { jobs } = await runOnce({ deletedFiles: 999 }, { command: "scrub", args: ["-p", "new"] });
  expect(jobs).toEqual(["scrub -p new"]);
});

test("scheduler - run now runs the routine once, not while a job runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  const path = join(dir, "schedules.json");
  try {
    // Disabled: run now works without the cron
    await writeFile(path, JSON.stringify({ schedules: [schedule({ enabled: false })] }));
    const engine = createFakeEngine();
    const scheduler = createScheduler(path, engine);

    const { done } = await scheduler.runNow("nightly");
    await done;
    expect(engine.jobs).toEqual(["touch", "sync", "scrub -p 8"]);

    await assertRejects(() => scheduler.runNow("unknown"));
    await engine.runJob({
      command: "sync",
      configPath: "/fake/snapraid.conf",
      afterRun: async () => {
        await assertRejects(() => scheduler.runNow("nightly"));
      },
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});
