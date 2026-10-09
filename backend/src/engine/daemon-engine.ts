// The engine on snapraid-daemon's REST API (tested with 2.0rc2). The daemon runs SnapRAID for
// one array; jobs are queued with /v1/schedule and followed through /v1/tasks and /v1/activity,
// the array and its disks come from /v1/array and /v2/disks.
// The daemon has no touch and no status job, those go to the fallback engine (the CLI).
import type {
  CommandOutput,
  DiffFileInfo,
  DiffReport,
  DiskIssue,
  DiskPowerStatus,
  FinishedJob,
  JobProgress,
  LastRun,
  LastRuns,
  ProbeReport,
  RunningJob,
  RunResult,
  SmartAttribute,
  SmartDiskInfo,
  SnapRaidCommand,
  SnapRaidStatus,
} from "@shared/types.ts";
import { parseRunReport, type RunReport } from "../run-report.ts";
import {
  EngineBusyError,
  type JobOutcome,
  type JobRequest,
  type SnapRaidEngine,
  type SmartReading,
  type StatusReading,
} from "./engine.ts";

// Jobs the daemon runs itself, see TaskSchedule in its snapraidd.yaml
export const DAEMON_COMMANDS: SnapRaidCommand[] = ["sync", "scrub", "check", "fix", "diff", "smart", "probe"];

export interface DaemonConnection {
  url: string;          // e.g. http://127.0.0.1:7627
  username?: string;
  password?: string;
}

export interface DaemonEngineOptions extends DaemonConnection {
  fallback: SnapRaidEngine;  // Runs what the daemon can't, e.g. touch
  fetch?: typeof fetch;
  pollMs?: number;
  readLog?: (path: string) => Promise<string>; // The task's SnapRAID log, when the daemon runs on this machine
  sleep?: (ms: number) => Promise<void>;
}

// ====================
// The daemon's JSON, only the fields used here
// ====================

export interface DaemonTask {
  number: number;
  command: string;
  status: "queued" | "starting" | "processing" | "finalizing" | "stopping" | "terminated" | "signaled" | "canceled";
  exit_code?: number;
  exit_msg?: string;
  scheduled_at?: string;
  started_at?: string;
  finished_at?: string;
  progress?: number;
  eta_seconds?: number;
  speed_mbs?: number;
  size_done_bytes?: number;
  log_file?: string;
  messages?: Array<{ level: string; text: string }>;
  error_io?: number;
  error_data?: number;
}

interface DaemonTasks {
  pending: DaemonTask[];
  active: DaemonTask[];
  history: DaemonTask[];
}

export interface DaemonArray {
  health?: string;
  engine_conf?: string;
  files_count?: number;
  total_space_bytes?: number;
  free_space_bytes?: number;
  blocks_bad?: number;
  blocks_unsynced?: number;
  blocks_unscrubbed?: number;
  blocks_count?: number;
  failure_probability?: number;
  diff_equal?: number;
  diff_added?: number;
  diff_removed?: number;
  diff_updated?: number;
  diff_moved?: number;
  diff_copied?: number;
  diff_relocated?: number;
  diff_restored?: number;
  diffs?: Array<{ change: string; disk: string; path: string }>;
  scrub_history?: {
    x_axis_low?: number;
    x_axis_high?: number;
    x_axis_median?: number;
    points?: Array<{ ago: number; scrubbed: number; new: number }>;
  };
}

interface DaemonSmartAttribute {
  name: string;
  when_failed?: "never" | "now" | "past";
  type?: "prefail" | "oldage";
  raw?: number | { value?: number };
  norm?: number | { value?: number };
  worst?: number;
  thresh?: number;
}

export interface DaemonDevice {
  node?: string;
  power?: "active" | "standby" | "pending";
  family?: string;
  model?: string;
  serial?: string;
  interface?: string;
  size_bytes?: number;
  rotational?: number;
  error_protocol?: number;
  error_medium?: number;
  wear_level?: number;
  failure_probability?: number;
  smart?: {
    attributes?: DaemonSmartAttribute[];
    power_on_hours?: number;
    temperature_celsius?: number;
    failing?: boolean;
    prefail?: boolean;
    prefail_logged?: boolean;
    error_logged?: boolean;
    selftest_error_logged?: boolean;
  };
}

interface DaemonDisk {
  name: string;
  health?: string;
  health_reason?: string;
  total_space_bytes?: number;
  free_space_bytes?: number;
  splits?: Array<{ path?: string }>;
  devices?: DaemonDevice[];
}

export interface DaemonDisks {
  data_disks?: DaemonDisk[];
  parity_disks?: DaemonDisk[];
}

// ====================
// Mapping to the UI's types, exported for tests
// ====================

const FINISHED = new Set(["terminated", "signaled", "canceled"]);
const TASK_APPEAR_TIMEOUT_MS = 30_000;
const toGB = (bytes = 0) => Math.max(0, Math.round(bytes / 1e8) / 10);
const number = (value: number | { value?: number } | undefined): number | undefined =>
  typeof value === "object" ? value?.value : value;

/**
 * The daemon reports SMART attributes by name only; the UI's assessment knows them by id
 */
const SMART_ATTRIBUTE_IDS: Record<string, number> = {
  Raw_Read_Error_Rate: 1,
  Reallocated_Sector_Ct: 5,
  Power_On_Hours: 9,
  Spin_Retry_Count: 10,
  Reported_Uncorrect: 187,
  Command_Timeout: 188,
  Airflow_Temperature_Cel: 190,
  Temperature_Celsius: 194,
  Reallocated_Event_Count: 196,
  Current_Pending_Sector: 197,
  Offline_Uncorrectable: 198,
  UDMA_CRC_Error_Count: 199,
};

const smartStatus = (device: DaemonDevice): SmartDiskInfo["status"] => {
  const smart = device.smart;
  if (!smart) return "UNKNOWN";
  if (smart.failing) return "FAIL";
  if (smart.prefail) return "PREFAIL";
  if (smart.prefail_logged) return "LOGFAIL";
  if (smart.error_logged) return "LOGERR";
  if (smart.selftest_error_logged) return "SELFERR";
  return "OK";
};

const toAttribute = (attribute: DaemonSmartAttribute): SmartAttribute => ({
  id: SMART_ATTRIBUTE_IDS[attribute.name] ?? 0,
  name: attribute.name,
  value: number(attribute.norm) ?? 0,
  worst: attribute.worst ?? 0,
  threshold: attribute.thresh ?? 0,
  raw: String(number(attribute.raw) ?? 0),
  flag: attribute.type ?? "",
  ...(attribute.when_failed === "now" || attribute.when_failed === "past" ? { whenFailed: attribute.when_failed } : {}),
});

const percent = (fraction: number | undefined) =>
  fraction === undefined ? undefined : Math.round(fraction * 10000) / 100;

const disksOf = (disks: DaemonDisks): DaemonDisk[] => [...(disks.data_disks ?? []), ...(disks.parity_disks ?? [])];

export const toSmartDisks = (disks: DaemonDisks): SmartDiskInfo[] =>
  disksOf(disks).flatMap((disk) =>
    (disk.devices ?? []).map((device): SmartDiskInfo => {
      const standby = device.power === "standby";
      return {
        name: disk.name,
        device: device.node ?? "",
        status: standby ? "UNKNOWN" : smartStatus(device),
        temperature: device.smart?.temperature_celsius,
        powerOnHours: device.smart?.power_on_hours,
        failureProbability: percent(device.failure_probability),
        model: device.model,
        family: device.family,
        interface: device.interface,
        rotationRate: device.rotational,
        serial: device.serial,
        size: device.size_bytes !== undefined ? String(device.size_bytes) : undefined,
        wearLevel: device.wear_level,
        errorMedium: device.error_medium,
        errorProtocol: device.error_protocol,
        ...(standby ? { standby: true } : {}),
        attributes: (device.smart?.attributes ?? []).map(toAttribute),
      };
    })
  );

const POWER: Record<string, DiskPowerStatus["status"]> = { active: "Active", standby: "Standby" };

export const toPowerStates = (disks: DaemonDisks): DiskPowerStatus[] =>
  disksOf(disks).flatMap((disk) =>
    (disk.devices ?? []).map((device) => ({
      name: disk.name,
      device: device.node ?? "",
      status: POWER[device.power ?? ""] ?? "Unknown",
    }))
  );

/**
 * A disk the daemon rates degraded is not what the content file recorded, usually not mounted
 */
const toDiskIssues = (disks: DaemonDisks): DiskIssue[] =>
  [
    ...(disks.data_disks ?? []).map((disk) => ({ disk, type: "data" as const })),
    ...(disks.parity_disks ?? []).map((disk) => ({ disk, type: "parity" as const })),
  ]
    .filter(({ disk }) => disk.health === "degraded")
    .map(({ disk, type }) => ({ disk: disk.name, type, kind: "missing", path: disk.splits?.[0]?.path ?? "" }));

export const toStatus = (array: DaemonArray, disks: DaemonDisks): SnapRaidStatus => {
  const bad = array.blocks_bad ?? 0;
  const unsynced = array.blocks_unsynced ?? 0;
  const total = array.blocks_count ?? 0;
  const hasErrors = bad > 0 || array.health === "corrupt";
  const history = array.scrub_history;
  const free = toGB(array.free_space_bytes);
  return {
    hasErrors,
    badBlocks: bad,
    parityUpToDate: unsynced === 0 && !hasErrors,
    newFiles: 0,
    modifiedFiles: 0,
    deletedFiles: 0,
    syncIncomplete: unsynced > 0,
    unsyncedBlocks: unsynced,
    scrubPercentage: total > 0 ? Math.floor((1 - (array.blocks_unscrubbed ?? 0) / total) * 100) : undefined,
    oldestScrubDays: history?.x_axis_high,
    medianScrubDays: history?.x_axis_median,
    newestScrubDays: history?.x_axis_low,
    totalFiles: array.files_count,
    totalUsedGB: toGB((array.total_space_bytes ?? 0) - (array.free_space_bytes ?? 0)),
    totalFreeGB: free,
    freeSpaceGB: free,
    // The daemon does not count files per disk
    disks: (disks.data_disks ?? []).map((disk) => {
      const size = disk.total_space_bytes ?? 0;
      const diskFree = disk.free_space_bytes ?? 0;
      return {
        name: disk.name,
        fragmentedFiles: 0,
        excessFragments: 0,
        wastedGB: 0,
        usedGB: toGB(size - diskFree),
        freeGB: toGB(diskFree),
        usePercent: size > 0 ? Math.round((1 - diskFree / size) * 100) : 0,
      };
    }),
    scrubHistory: (history?.points ?? [])
      .filter((point) => point.scrubbed + point.new > 0)
      .map((point) => ({ daysAgo: point.ago, percentage: Math.round(point.scrubbed + point.new) })),
    diskIssues: toDiskIssues(disks),
    rawOutput: "",
  };
};

const CHANGE: Record<string, DiffFileInfo["status"]> = {
  added: "added",
  removed: "removed",
  updated: "updated",
  moved: "moved",
  relocated: "moved",
  copied: "copied",
  restored: "restored",
};

export const toDiffReport = (array: DaemonArray): DiffReport => {
  const counts = {
    equalFiles: array.diff_equal ?? 0,
    newFiles: array.diff_added ?? 0,
    modifiedFiles: array.diff_updated ?? 0,
    deletedFiles: array.diff_removed ?? 0,
    movedFiles: (array.diff_moved ?? 0) + (array.diff_relocated ?? 0),
    copiedFiles: array.diff_copied ?? 0,
    restoredFiles: array.diff_restored ?? 0,
  };
  return {
    files: (array.diffs ?? []).map((diff) => ({
      status: CHANGE[diff.change] ?? "updated",
      name: diff.path,
      disk: diff.disk,
    })),
    totalFiles: Object.values(counts).reduce((sum, count) => sum + count, 0),
    ...counts,
    timestamp: new Date().toISOString(),
    rawOutput: "",
  };
};

/**
 * Result of a finished task: from its SnapRAID log when it can be read, from the task otherwise
 */
export const toRunReport = (command: SnapRaidCommand, task: DaemonTask, aborted: boolean, log: string): RunReport => {
  const durationSec = task.started_at && task.finished_at
    ? Math.max(0, Math.round((Date.parse(task.finished_at) - Date.parse(task.started_at)) / 1000))
    : 0;
  if (log) return parseRunReport(command, log, { exitCode: task.exit_code ?? null, aborted }, durationSec);

  const result: RunResult = aborted || task.status === "signaled"
    ? "aborted"
    : task.status === "canceled"
    ? "error"
    : task.exit_code === 0
    ? "ok"
    : "error";
  return {
    command,
    result,
    durationSec,
    ioErrors: task.error_io ?? 0,
    dataErrors: task.error_data ?? 0,
    log: "",
    ...(task.status === "canceled" ? { error: task.exit_msg || "Canceled by the daemon" } : {}),
  };
};

// diff exits with 0 without changes and 2 with changes, anything else means it stopped early
export const diffSucceeded = (task: DaemonTask): boolean =>
  task.status === "terminated" && (task.exit_code === 0 || task.exit_code === 2);

/**
 * The newest finished sync and scrub in the daemon's task history
 */
export const toLastRuns = (history: DaemonTask[]): LastRuns => {
  const last = (command: SnapRaidCommand): LastRun | null => {
    const task = history
      .filter((entry) => entry.command === command && FINISHED.has(entry.status) && entry.finished_at)
      .sort((a, b) => b.number - a.number)[0];
    if (!task) return null;
    return {
      // The daemon writes local time without a zone, like the times it shows
      timestamp: new Date(task.finished_at!).toISOString(),
      result: toRunReport(command, task, false, "").result,
      // The log is the daemon's, the UI's log viewer can't open it
      logFile: "",
    };
  };
  return { sync: last("sync"), scrub: last("scrub") };
};

export const toProgress = (task: DaemonTask): JobProgress | null =>
  task.status === "processing" && task.progress !== undefined
    ? {
      percent: task.progress,
      processedMB: Math.round((task.size_done_bytes ?? 0) / 1e6),
      ...(task.speed_mbs ? { speedMBs: task.speed_mbs } : {}),
      ...(task.eta_seconds ? { etaMinutes: Math.ceil(task.eta_seconds / 60) } : {}),
    }
    : null;

// ====================
// The engine
// ====================

/**
 * The daemon could not be reached or refused the request
 */
export class DaemonError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "DaemonError";
  }
}

export const createDaemonClient = (connection: DaemonConnection, fetchFn: typeof fetch = fetch) => {
  const base = connection.url.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (connection.username) {
    headers.Authorization = `Basic ${btoa(`${connection.username}:${connection.password ?? ""}`)}`;
  }

  const request = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetchFn(`${base}/snapraid${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DaemonError(`snapraid-daemon not reachable at ${base}: ${error instanceof Error ? error.message : error}`);
    }
    const text = await response.text();
    if (response.status === 401) throw new DaemonError("snapraid-daemon rejected the username or password", 401);
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON, e.g. an error page of a proxy
    }
    if (!response.ok) {
      const message = (json as { message?: string } | null)?.message ?? (text.trim() || response.statusText);
      throw new DaemonError(`snapraid-daemon: ${message}`, response.status);
    }
    return json as T;
  };

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  };
};

export type DaemonClient = ReturnType<typeof createDaemonClient>;

export const createDaemonEngine = (options: DaemonEngineOptions): SnapRaidEngine => {
  const client = createDaemonClient(options, options.fetch);
  const pollMs = options.pollMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const readLog = options.readLog ?? ((path: string) => Deno.readTextFile(path));
  const { fallback } = options;

  const state = {
    current: null as RunningJob | null,
    number: null as number | null,
    output: "",
    last: null as FinishedJob | null,
    abortRequested: false,
    onProgress: null as ((job: RunningJob, progress: JobProgress) => void) | null,
  };

  const tasks = () => client.get<DaemonTasks>("/v1/tasks");
  const highestNumber = (list: DaemonTasks) =>
    Math.max(0, ...[...list.pending, ...list.active, ...list.history].map((task) => task.number));

  // The task that was scheduled after `after` for the command, wherever it is now
  const findTask = (list: DaemonTasks, after: number, command: string) =>
    [...list.pending, ...list.active, ...list.history]
      .filter((task) => task.number > after && task.command === command)
      .sort((a, b) => a.number - b.number)[0];

  /**
   * Queue a command and follow it to the end, reporting new messages and progress
   */
  const runTask = async (
    command: SnapRaidCommand,
    args: string[],
    onMessages: (text: string) => void,
  ): Promise<DaemonTask> => {
    const before = highestNumber(await tasks());
    await client.post("/v1/schedule", { tasks: [{ command, ...(args.length ? { args } : {}) }] });

    let seenMessages = 0;
    // A scheduled task shows up at once; one that never does was dropped by the daemon
    let waitedMs = 0;
    while (true) {
      const task = findTask(await tasks(), before, command);
      if (!task && (waitedMs += pollMs) > TASK_APPEAR_TIMEOUT_MS) {
        throw new DaemonError(`snapraid-daemon accepted the ${command} but never ran it`);
      }
      if (task) {
        if (state.current && state.number !== task.number) {
          state.number = task.number;
          state.current = { ...state.current, processId: `daemon-${task.number}` };
        }
        if (task.status !== "queued") {
          const activity = await client.get<DaemonTask>("/v1/activity");
          const live = activity?.number === task.number ? activity : task;
          const messages = live.messages ?? [];
          if (messages.length > seenMessages) {
            onMessages(messages.slice(seenMessages).map((message) => `${message.text}\n`).join(""));
            seenMessages = messages.length;
          }
          const progress = toProgress(live);
          if (progress && state.current) {
            state.current = { ...state.current, progress };
            state.onProgress?.(state.current, progress);
          }
        }
        if (FINISHED.has(task.status)) return task;
      }
      await sleep(pollMs);
    }
  };

  const readTaskLog = async (task: DaemonTask) => {
    if (!task.log_file) return "";
    try {
      return await readLog(task.log_file);
    } catch {
      // The daemon runs on another machine, the task's own figures stand in
      return "";
    }
  };

  const runOnDaemon = async ({ command, configPath, args = [], onOutput, afterRun }: JobRequest): Promise<JobOutcome> => {
    const timestamp = new Date().toISOString();
    state.current = { command, configPath, startTime: timestamp, processId: `daemon-pending-${Date.now()}` };
    state.number = null;
    state.output = "";
    state.abortRequested = false;
    const emit = (text: string) => {
      state.output = (state.output + text).slice(-64 * 1024);
      onOutput?.(text);
    };

    try {
      const task = await runTask(command, args, emit);
      const log = await readTaskLog(task);
      const aborted = state.abortRequested;
      const output: CommandOutput = {
        command: `snapraid ${[command, ...args].join(" ")}`,
        output: state.output,
        timestamp,
        exitCode: task.exit_code ?? null,
        aborted,
        ...(log && task.log_file ? { logPath: task.log_file } : {}),
      };
      const outcome: JobOutcome = {
        output,
        report: { ...toRunReport(command, task, aborted, log), ...(task.log_file ? { logFile: task.log_file.replace(/^.*\//, "") } : {}) },
        ...(command === "smart" ? { smart: toSmartDisks(await client.get<DaemonDisks>("/v2/disks")) } : {}),
      };
      // Still counts as the current job, so nothing else starts before the follow-up is done
      await afterRun?.(outcome);
      state.last = {
        command,
        processId: state.current?.processId ?? `daemon-${task.number}`,
        exitCode: output.exitCode,
        aborted,
        finishedAt: new Date().toISOString(),
      };
      return outcome;
    } catch (error) {
      state.last = {
        command,
        processId: state.current?.processId ?? "daemon",
        exitCode: null,
        aborted: false,
        error: String(error),
        finishedAt: new Date().toISOString(),
      };
      throw error;
    } finally {
      state.current = null;
      state.number = null;
      state.output = "";
    }
  };

  const requireIdle = () => {
    if (state.current) throw new EngineBusyError("job");
  };

  return {
    kind: "daemon",

    runJob: (request) => (DAEMON_COMMANDS.includes(request.command) ? runOnDaemon(request) : fallback.runJob(request)),

    abortJob: (processId) => {
      if (state.current?.processId === processId) {
        state.abortRequested = true;
        state.current = { ...state.current, aborting: true };
        client.post("/v1/stop").catch((error) => console.error("Failed to stop the daemon's task:", error));
        return true;
      }
      return fallback.abortJob(processId);
    },
    currentJob: () => state.current ?? fallback.currentJob(),
    currentOutput: () => (state.current ? state.output : fallback.currentOutput()),
    lastJob: () => {
      const other = fallback.lastJob();
      if (!state.last || !other) return state.last ?? other;
      return state.last.finishedAt > other.finishedAt ? state.last : other;
    },
    onProgress: (listener) => {
      state.onProgress = listener;
      fallback.onProgress(listener);
    },

    readStatus: async (): Promise<StatusReading> => {
      requireIdle();
      if (fallback.currentJob()) throw new EngineBusyError("job");
      const [array, disks] = await Promise.all([
        client.get<DaemonArray>("/v1/array"),
        client.get<DaemonDisks>("/v2/disks"),
      ]);
      return { status: toStatus(array, disks), exitCode: 0, log: "" };
    },

    readDiff: async () => {
      requireIdle();
      const task = await runTask("diff", [], () => {});
      const report = toDiffReport(await client.get<DaemonArray>("/v1/array?limit_diffs=100000"));
      return { ...report, failed: !diffSucceeded(task) };
    },

    readSmart: async (): Promise<SmartReading> => {
      const [disks, array] = await Promise.all([
        client.get<DaemonDisks>("/v2/disks"),
        client.get<DaemonArray>("/v1/array"),
      ]);
      return {
        disks: toSmartDisks(disks),
        arrayFailureProbability: percent(array.failure_probability),
        rawOutput: "",
        exitCode: 0,
      };
    },

    readLastRuns: async () => toLastRuns((await tasks()).history),

    readPowerStates: async (): Promise<ProbeReport> => ({
      disks: toPowerStates(await client.get<DaemonDisks>("/v2/disks")),
      timestamp: new Date().toISOString(),
      rawOutput: "",
    }),
  };
};

