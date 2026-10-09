// What runs SnapRAID for the UI. Everything the UI could get from snapraid-daemon's REST
// API instead of calling the CLI itself sits behind this interface: jobs and their
// progress, the array status, the diff, SMART and the power state. Config editing, dup,
// list, devices, the spindown, schedules and notifications stay with the UI either way.
import type {
  CommandOutput,
  DiffReport,
  FinishedJob,
  JobProgress,
  ProbeReport,
  RunningJob,
  SmartDiskInfo,
  SnapRaidCommand,
  SnapRaidStatus,
} from "@shared/types.ts";
import type { RunReport } from "../run-report.ts";

export interface JobRequest {
  command: SnapRaidCommand;
  configPath: string;
  args?: string[];
  onOutput?: (chunk: string) => void;
  // Runs while the job still counts as current, so nothing else starts before it is done
  afterRun?: (outcome: JobOutcome) => Promise<void>;
}

export interface JobOutcome {
  output: CommandOutput;
  report: RunReport;
  smart?: SmartDiskInfo[]; // smart: the disks it reported
}

export interface StatusReading {
  status: SnapRaidStatus;  // With the disk issues
  exitCode: number | null;
  log: string;             // The engine's raw report, for the in-memory history
}

export interface SmartReading {
  disks: SmartDiskInfo[];
  arrayFailureProbability?: number;
  rawOutput: string;
  exitCode: number | null;
  error?: string;          // What went wrong when there are no disks
}

export interface SnapRaidEngine {
  readonly kind: "cli" | "daemon";

  /**
   * Run a job; one at a time, the caller checks `currentJob()` first.
   * Rejects only when the job could not be started at all.
   */
  runJob(request: JobRequest): Promise<JobOutcome>;
  /** Ask the running job to stop; false when there is no such job */
  abortJob(processId: string): boolean;
  currentJob(): RunningJob | null;
  /** Output of the running job so far, replayed to clients that connect meanwhile */
  currentOutput(): string;
  lastJob(): FinishedJob | null;
  onProgress(listener: (job: RunningJob, progress: JobProgress) => void): void;

  /** The array as the content file describes it. Throws EngineBusyError while SnapRAID is locked */
  readStatus(configPath: string): Promise<StatusReading>;
  /** Changes since the last sync */
  readDiff(configPath: string): Promise<DiffReport>;
  readSmart(configPath: string): Promise<SmartReading>;
  /** Power state without waking disks. Throws EngineUnsupportedError when the controller can't tell */
  readPowerStates(configPath: string): Promise<ProbeReport>;
}

/**
 * SnapRAID holds its lock: a job of this engine runs, or another process (e.g. a host cron job)
 */
export class EngineBusyError extends Error {
  constructor(readonly reason: "job" | "locked") {
    super(reason === "job" ? "A job is running" : "SnapRAID is in use by another process");
    this.name = "EngineBusyError";
  }
}

export class EngineUnsupportedError extends Error {
  constructor(message: string, readonly rawOutput = "", readonly exitCode: number | null = null) {
    super(message);
    this.name = "EngineUnsupportedError";
  }
}

/**
 * A command that failed, with what SnapRAID printed
 */
export class EngineCommandError extends Error {
  constructor(message: string, readonly rawOutput = "", readonly exitCode: number | null = null) {
    super(message);
    this.name = "EngineCommandError";
  }
}

let current: SnapRaidEngine | null = null;

/**
 * The engine set up at startup (main.ts), or one a test put in place
 */
export const getEngine = (): SnapRaidEngine => {
  if (!current) throw new Error("SnapRAID engine not initialized");
  return current;
};

export const setEngine = (engine: SnapRaidEngine): void => {
  current = engine;
};

/**
 * The engine with its jobs run through `runJob`, which gets the original one to call;
 * everything else goes to the engine as is
 */
export const wrapJobs = (
  engine: SnapRaidEngine,
  runJob: (request: JobRequest, run: (request: JobRequest) => Promise<JobOutcome>) => Promise<JobOutcome>,
): SnapRaidEngine => ({
  kind: engine.kind,
  runJob: (request) => runJob(request, (inner) => engine.runJob(inner)),
  abortJob: (processId) => engine.abortJob(processId),
  currentJob: () => engine.currentJob(),
  currentOutput: () => engine.currentOutput(),
  lastJob: () => engine.lastJob(),
  onProgress: (listener) => engine.onProgress(listener),
  readStatus: (configPath) => engine.readStatus(configPath),
  readDiff: (configPath) => engine.readDiff(configPath),
  readSmart: (configPath) => engine.readSmart(configPath),
  readPowerStates: (configPath) => engine.readPowerStates(configPath),
});
