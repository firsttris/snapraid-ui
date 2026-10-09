import { Cron } from "@hexagon/croner";
import type {
  RunResult,
  Schedule,
  ScheduleConfig,
  ScheduleOutcome,
  ScheduleStepOutcome,
  SnapRaidCommand,
} from "@shared/types.ts";
import type { SnapRaidEngine } from "./engine/engine.ts";
import { existsSync } from "@std/fs";
import { resolveFromBase } from "./config.ts";
import { failedReport, isSuccessful, type RunReport } from "./run-report.ts";
import { isReplacementInProgress } from "./disk-replacement.ts";
import { withCrcBaseline } from "./smart-baseline.ts";
import { recordSmartHistory } from "./smart-history.ts";
import { notifyRun, notifySkipped, notifySmart } from "./notification-events.ts";
import { msg } from "@shared/i18n.ts";
import { blockingIssues } from "./disk-check.ts";
import { holdContainers } from "./container-pause.ts";

// Module-level storage for active jobs
const activeJobs = new Map<string, Cron>();

// Validate cron expression and get next run
const validateCronExpression = (expression: string): Date | undefined => {
  try {
    const cron = new Cron(expression);
    return cron.nextRun() ?? undefined;
  } catch (error) {
    throw new Error(msg("server_error_invalid_cron", { error: error instanceof Error ? error.message : String(error) }));
  }
};

// Create new schedule with defaults
const createNewSchedule = (
  input: Omit<Schedule, "id" | "createdAt" | "updatedAt" | "lastRun" | "nextRun">
): Schedule => {
  const now = new Date().toISOString();
  const nextRun = validateCronExpression(input.cronExpression);

  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    nextRun: nextRun?.toISOString(),
  };
};

// Merge schedule updates
const mergeScheduleUpdates = (
  existing: Schedule,
  updates: Partial<Omit<Schedule, "id" | "createdAt">>
): Schedule => {
  const merged = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.cronExpression) {
    const nextRun = validateCronExpression(updates.cronExpression);
    merged.nextRun = nextRun?.toISOString();
  }

  return merged;
};

// Load schedules from file
const loadSchedulesFromFile = async (path: string): Promise<Schedule[]> => {
  if (!existsSync(path)) {
    return [];
  }

  const content = await Deno.readTextFile(path);
  const config = JSON.parse(content) as ScheduleConfig;
  return config.schedules;
};

// Save schedules to file
const saveSchedulesToFile = async (path: string, schedules: Schedule[]): Promise<void> => {
  const config: ScheduleConfig = { schedules };
  await Deno.writeTextFile(path, JSON.stringify(config, null, 2));
};

// Apply changes to one schedule; reloads first, it may have been edited while a job ran
const updateStoredSchedule = async (
  configPath: string,
  scheduleId: string,
  updates: Partial<Schedule>
): Promise<void> => {
  const schedules = await loadSchedulesFromFile(configPath);
  await saveSchedulesToFile(
    configPath,
    schedules.map((s) => (s.id === scheduleId ? { ...s, ...updates } : s))
  );
};

const skipped = (skip: Omit<ScheduleOutcome, "timestamp" | "result">): ScheduleOutcome => ({
  timestamp: new Date().toISOString(),
  result: "skipped",
  ...skip,
});

// An unattended sync after a disk went missing or empty would drop its files from parity,
// so check the pending deletions first
const checkSyncGuard = async (
  engine: SnapRaidEngine,
  schedule: Schedule,
  snapraidConfigPath: string
): Promise<ScheduleOutcome | null> => {
  if (schedule.command !== "sync" || schedule.maxDeletedFiles == null) return null;

  try {
    const diff = await engine.readDiff(snapraidConfigPath);
    if (diff.failed) {
      return skipped({ skipReason: "diff_failed", error: diff.rawOutput.trim().split("\n").pop() });
    }
    if (diff.deletedFiles > schedule.maxDeletedFiles) {
      return skipped({ skipReason: "too_many_deleted", deletedFiles: diff.deletedFiles });
    }
    return null;
  } catch (error) {
    return skipped({ skipReason: "diff_failed", error: String(error) });
  }
};

// Commands that work on the files of the disks; on an empty mount point sync drops them from parity,
// the others report every file as an error
const DISK_COMMANDS: SnapRaidCommand[] = ["sync", "scrub", "touch", "check", "fix"];

// A missing or unmounted disk stops the run, someone has to look at it first
const checkDisksGuard = async (
  engine: SnapRaidEngine,
  schedule: Schedule,
  snapraidConfigPath: string
): Promise<ScheduleOutcome | null> => {
  if (!scheduleSteps(schedule).some((step) => DISK_COMMANDS.includes(step.command))) return null;

  try {
    const { status } = await engine.readStatus(snapraidConfigPath);
    const missing = blockingIssues(status.diskIssues ?? []);
    return missing.length > 0
      ? skipped({ skipReason: "disk_missing", disks: missing.map((issue) => issue.disk) })
      : null;
  } catch (error) {
    // The run itself reports what is wrong, the check is only a safety net
    console.error(`Disk check before ${schedule.name} failed:`, error);
    return null;
  }
};

interface ScheduleStep {
  command: SnapRaidCommand;
  args: string[];
}

// A sync schedule can run touch before and scrub after the sync, the usual nightly routine
export const scheduleSteps = (schedule: Schedule): ScheduleStep[] => {
  const isSync = schedule.command === "sync";
  return [
    ...(isSync && schedule.touchBefore ? [{ command: "touch" as const, args: [] }] : []),
    { command: schedule.command, args: schedule.args || [] },
    ...(isSync && schedule.scrubAfter ? [{ command: "scrub" as const, args: schedule.scrubAfter }] : []),
  ];
};

/**
 * Overall result of the steps: the first failure, otherwise warning if any step warned
 */
export const combineResults = (results: RunResult[]): RunResult =>
  results.find((result) => !isSuccessful(result)) ??
    (results.includes("warning") ? "warning" : "ok");

// Execute scheduled command; exported for tests, the cron jobs call it
export const executeScheduledCommand = async (
  configPath: string,
  engine: SnapRaidEngine,
  onOutput: ((scheduleId: string, chunk: string) => void) | undefined,
  scheduleId: string
): Promise<void> => {
  const schedules = await loadSchedulesFromFile(configPath);
  const schedule = schedules.find((s) => s.id === scheduleId);
  if (!schedule) return;

  const nextRun = activeJobs.get(scheduleId)?.nextRun()?.toISOString();
  const snapraidConfigPath = resolveFromBase(schedule.configPath);

  const skip = engine.currentJob()
    ? skipped({ skipReason: "job_running" })
    : await isReplacementInProgress(schedule.configPath)
    ? skipped({ skipReason: "recovery_in_progress" })
    : await checkDisksGuard(engine, schedule, snapraidConfigPath) ??
      await checkSyncGuard(engine, schedule, snapraidConfigPath);
  if (skip) {
    console.warn(`Scheduled job skipped: ${schedule.name} (${skip.skipReason})`);
    await updateStoredSchedule(configPath, scheduleId, { nextRun, lastOutcome: skip });
    await notifySkipped(schedule.name, snapraidConfigPath, skip, schedule.maxDeletedFiles);
    return;
  }

  await updateStoredSchedule(configPath, scheduleId, {
    lastRun: new Date().toISOString(),
    nextRun,
  });

  const steps = scheduleSteps(schedule);
  const reports: RunReport[] = [];

  // Paused once for all steps, not resumed between touch, sync and scrub
  const releaseContainers = await holdContainers(
    steps.map((step) => step.command),
    (line) => onOutput?.(scheduleId, `${line}\n`),
  );
  try {
    for (const step of steps) {
      // A manual job may have started between two steps, SnapRAID would refuse to run next to it
      if (reports.length > 0 && engine.currentJob()) {
        reports.push(failedReport(step.command, "Another job started before this step"));
        break;
      }
      try {
        const { report, smart } = await engine.runJob({
          command: step.command,
          configPath: snapraidConfigPath,
          args: step.args,
          onOutput: (chunk) => onOutput?.(scheduleId, chunk),
        });
        reports.push(report);
        if (smart) {
          const disks = await withCrcBaseline(snapraidConfigPath, smart);
          await recordSmartHistory(snapraidConfigPath, disks);
          await notifySmart(snapraidConfigPath, disks);
        }
        if (!isSuccessful(report.result)) break;
      } catch (error) {
        console.error(`Scheduled job failed: ${schedule.name}:`, error);
        reports.push(failedReport(step.command, String(error)));
        break;
      }
    }
  } finally {
    await releaseContainers();
  }

  const error = reports.find((report) => report.error)?.error;
  const outcome: ScheduleOutcome = {
    timestamp: new Date().toISOString(),
    result: combineResults(reports.map((report) => report.result)),
    ...(error ? { error } : {}),
    ...(steps.length > 1
      ? { steps: reports.map((report): ScheduleStepOutcome => ({ command: report.command, result: report.result })) }
      : {}),
  };
  await updateStoredSchedule(configPath, scheduleId, { lastOutcome: outcome });

  const notRun = steps.slice(reports.length).map((step) => step.command);
  await notifyRun(schedule.name, snapraidConfigPath, reports, notRun);
};

// Start cron job for schedule
const startCronJob = (
  configPath: string,
  engine: SnapRaidEngine,
  onOutput: ((scheduleId: string, chunk: string) => void) | undefined,
  schedule: Schedule
): void => {
  // Stop existing job if any
  stopCronJob(schedule.id);

  try {
    const job = new Cron(schedule.cronExpression, () =>
      executeScheduledCommand(configPath, engine, onOutput, schedule.id)
    );

    activeJobs.set(schedule.id, job);
  } catch (error) {
    console.error(`Failed to start schedule ${schedule.id}:`, error);
  }
};

// Stop cron job
const stopCronJob = (scheduleId: string): void => {
  const job = activeJobs.get(scheduleId);
  if (job) {
    job.stop();
    activeJobs.delete(scheduleId);
  }
};

// Stop all jobs
const stopAllJobs = (): void => {
  activeJobs.forEach((job) => job.stop());
  activeJobs.clear();
};

// Public API factory
export const createScheduler = (configPath: string, engine: SnapRaidEngine) => {
  let outputCallback: ((scheduleId: string, chunk: string) => void) | undefined;

  return {
    setOutputCallback: (callback: (scheduleId: string, chunk: string) => void) => {
      outputCallback = callback;
    },

    loadSchedules: async (): Promise<void> => {
      const schedules = await loadSchedulesFromFile(configPath);
      
      schedules
        .filter((schedule) => schedule.enabled)
        .forEach((schedule) => startCronJob(configPath, engine, outputCallback, schedule));
    },

    // Schedules replaced on disk, e.g. by restoring a backup
    reloadSchedules: async (): Promise<void> => {
      stopAllJobs();
      const schedules = await loadSchedulesFromFile(configPath);
      schedules
        .filter((schedule) => schedule.enabled)
        .forEach((schedule) => startCronJob(configPath, engine, outputCallback, schedule));
    },

    getSchedules: (): Promise<Schedule[]> => 
      loadSchedulesFromFile(configPath),

    /**
     * Run a schedule once, now, with the same checks as a timed run; also a disabled one.
     * Resolves once it started, `done` when it finished.
     */
    runNow: async (id: string): Promise<{ done: Promise<void> }> => {
      const schedules = await loadSchedulesFromFile(configPath);
      if (!schedules.some((s) => s.id === id)) throw new Error(msg("server_error_schedule_not_found"));
      if (engine.currentJob()) throw new Error(msg("server_error_job_running"));
      const done = executeScheduledCommand(configPath, engine, outputCallback, id).catch((error) =>
        console.error(`Schedule ${id} run failed:`, error)
      );
      return { done };
    },

    getSchedule: async (id: string): Promise<Schedule | undefined> => {
      const schedules = await loadSchedulesFromFile(configPath);
      return schedules.find((s) => s.id === id);
    },

    createSchedule: async (
      input: Omit<Schedule, "id" | "createdAt" | "updatedAt" | "lastRun" | "nextRun">
    ): Promise<Schedule> => {
      const newSchedule = createNewSchedule(input);
      const schedules = await loadSchedulesFromFile(configPath);
      const updated = [...schedules, newSchedule];
      
      await saveSchedulesToFile(configPath, updated);

      if (newSchedule.enabled) {
        startCronJob(configPath, engine, outputCallback, newSchedule);
      }

      return newSchedule;
    },

    updateSchedule: async (
      id: string,
      updates: Partial<Omit<Schedule, "id" | "createdAt">>
    ): Promise<Schedule> => {
      const schedules = await loadSchedulesFromFile(configPath);
      const existing = schedules.find((s) => s.id === id);
      
      if (!existing) {
        throw new Error(msg("server_error_schedule_not_found"));
      }

      const wasEnabled = existing.enabled;
      const updated = mergeScheduleUpdates(existing, updates);
      const updatedSchedules = schedules.map((s) => (s.id === id ? updated : s));

      await saveSchedulesToFile(configPath, updatedSchedules);

      const shouldRestart =
        updated.enabled &&
        (updates.cronExpression || updates.command || updates.configPath);

      if (wasEnabled && !updated.enabled) {
        stopCronJob(id);
      } else if (!wasEnabled && updated.enabled) {
        startCronJob(configPath, engine, outputCallback, updated);
      } else if (shouldRestart) {
        stopCronJob(id);
        startCronJob(configPath, engine, outputCallback, updated);
      }

      return updated;
    },

    deleteSchedule: async (id: string): Promise<void> => {
      const schedules = await loadSchedulesFromFile(configPath);
      const exists = schedules.some((s) => s.id === id);

      if (!exists) {
        throw new Error(msg("server_error_schedule_not_found"));
      }

      stopCronJob(id);
      const updated = schedules.filter((s) => s.id !== id);
      await saveSchedulesToFile(configPath, updated);
    },

    stopAll: () => stopAllJobs(),

    getNextRuns: (): Map<string, Date | null> => {
      const nextRuns = new Map<string, Date | null>();
      activeJobs.forEach((job, id) => {
        nextRuns.set(id, job.nextRun());
      });
      return nextRuns;
    },
  };
};

export type Scheduler = ReturnType<typeof createScheduler>;
