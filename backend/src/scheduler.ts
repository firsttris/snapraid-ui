import { Cron } from "@hexagon/croner";
import type { Schedule, ScheduleConfig } from "@shared/types.ts";
import type { SnapRaidRunner } from "./snapraid-runner.ts";
import { existsSync } from "@std/fs";
import { join } from "@std/path";
import { BASE_PATH } from "./config.ts";

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

  const currentJob = runner.getCurrentJob();
  if (currentJob) {
    return;
  }

  const job = activeJobs.get(scheduleId);
  const nextRun = job?.nextRun();
  
  const updatedSchedule: Schedule = {
    ...schedule,
    lastRun: new Date().toISOString(),
    nextRun: nextRun?.toISOString(),
  };

  const updatedSchedules = schedules.map((s) =>
    s.id === scheduleId ? updatedSchedule : s
  );
  await saveSchedulesToFile(configPath, updatedSchedules);

  try {
    await runner.executeCommand(
      schedule.command,
      join(BASE_PATH, schedule.configPath),
      (chunk) => onOutput?.(scheduleId, chunk),
      schedule.args || []
    );
  } catch (error) {
    console.error(`Scheduled job failed: ${schedule.name}:`, error);
  }
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
