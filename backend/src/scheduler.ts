import { Cron } from "@hexagon/croner";
import type {
  RunResult,
  Schedule,
  ScheduleConfig,
  ScheduleOutcome,
  ScheduleStepOutcome,
  SnapRaidCommand,
} from "@shared/types.ts";
import type { SnapRaidRunner } from "./snapraid-runner.ts";
import { existsSync } from "@std/fs";
import { resolveFromBase } from "./config.ts";
import { failedReport, isSuccessful, readRunReport, type RunReport } from "./run-report.ts";
import { isReplacementInProgress } from "./disk-replacement.ts";
import { notifyRun, notifySkipped, notifySmart } from "./notification-events.ts";
import { parseSmartOutput } from "./parsers/smart-parser.ts";

// Module-level storage for active jobs
const activeJobs = new Map<string, Cron>();

// Validate cron expression and get next run
const validateCronExpression = (expression: string): Date | undefined => {
  try {
    const cron = new Cron(expression);
    return cron.nextRun() ?? undefined;
  } catch (error) {
    throw new Error(`Invalid cron expression: ${error}`);
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
  runner: SnapRaidRunner,
  schedule: Schedule,
  snapraidConfigPath: string
): Promise<ScheduleOutcome | null> => {
  if (schedule.command !== "sync" || schedule.maxDeletedFiles == null) return null;

  try {
    const diff = await runner.runDiff(snapraidConfigPath);
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

// Execute scheduled command
const executeScheduledCommand = async (
  configPath: string,
  runner: SnapRaidRunner,
  onOutput: ((scheduleId: string, chunk: string) => void) | undefined,
  scheduleId: string
): Promise<void> => {
  const schedules = await loadSchedulesFromFile(configPath);
  const schedule = schedules.find((s) => s.id === scheduleId);
  if (!schedule) return;

  const nextRun = activeJobs.get(scheduleId)?.nextRun()?.toISOString();
  const snapraidConfigPath = resolveFromBase(schedule.configPath);

  const skip = runner.getCurrentJob()
    ? skipped({ skipReason: "job_running" })
    : await isReplacementInProgress(schedule.configPath)
    ? skipped({ skipReason: "recovery_in_progress" })
    : await checkSyncGuard(runner, schedule, snapraidConfigPath);
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

  for (const step of steps) {
    // A manual job may have started between two steps, SnapRAID would refuse to run next to it
    if (reports.length > 0 && runner.getCurrentJob()) {
      reports.push(failedReport(step.command, "Another job started before this step"));
      break;
    }
    try {
      const output = await runner.executeCommand(
        step.command,
        snapraidConfigPath,
        (chunk) => onOutput?.(scheduleId, chunk),
        step.args,
      );
      const report = await readRunReport(step.command, output);
      reports.push(report);
      if (step.command === "smart") {
        await notifySmart(snapraidConfigPath, parseSmartOutput(report.log));
      }
      if (!isSuccessful(report.result)) break;
    } catch (error) {
      console.error(`Scheduled job failed: ${schedule.name}:`, error);
      reports.push(failedReport(step.command, String(error)));
      break;
    }
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
  runner: SnapRaidRunner,
  onOutput: ((scheduleId: string, chunk: string) => void) | undefined,
  schedule: Schedule
): void => {
  // Stop existing job if any
  stopCronJob(schedule.id);

  try {
    const job = new Cron(schedule.cronExpression, () =>
      executeScheduledCommand(configPath, runner, onOutput, schedule.id)
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
export const createScheduler = (configPath: string, runner: SnapRaidRunner) => {
  let outputCallback: ((scheduleId: string, chunk: string) => void) | undefined;

  return {
    setOutputCallback: (callback: (scheduleId: string, chunk: string) => void) => {
      outputCallback = callback;
    },

    loadSchedules: async (): Promise<void> => {
      const schedules = await loadSchedulesFromFile(configPath);
      
      schedules
        .filter((schedule) => schedule.enabled)
        .forEach((schedule) => startCronJob(configPath, runner, outputCallback, schedule));
    },

    getSchedules: (): Promise<Schedule[]> => 
      loadSchedulesFromFile(configPath),

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
        startCronJob(configPath, runner, outputCallback, newSchedule);
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
        throw new Error(`Schedule ${id} not found`);
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
        startCronJob(configPath, runner, outputCallback, updated);
      } else if (shouldRestart) {
        stopCronJob(id);
        startCronJob(configPath, runner, outputCallback, updated);
      }

      return updated;
    },

    deleteSchedule: async (id: string): Promise<void> => {
      const schedules = await loadSchedulesFromFile(configPath);
      const exists = schedules.some((s) => s.id === id);

      if (!exists) {
        throw new Error(`Schedule ${id} not found`);
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
