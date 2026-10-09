// An engine for tests: jobs finish at once with the configured result, reads return what
// the test set up. It records the jobs it ran.
import type {
  DiffReport,
  DiskIssue,
  FinishedJob,
  RunningJob,
  RunResult,
  SnapRaidCommand,
  SnapRaidStatus,
} from "@shared/types.ts";
import { EngineBusyError, type JobOutcome, type SnapRaidEngine } from "../engine/engine.ts";

export interface FakeEngineOptions {
  disks?: string[];
  diskIssues?: DiskIssue[];
  deletedFiles?: number;
  results?: Partial<Record<SnapRaidCommand, RunResult>>;
}

export interface FakeEngine extends SnapRaidEngine {
  jobs: string[];          // "sync -h", in the order they ran
  addFile: (name: string) => void;
  setBusy: (busy: boolean) => void;
}

export const createFakeEngine = (options: FakeEngineOptions = {}): FakeEngine => {
  const disks = options.disks ?? ["d1", "d2"];
  const jobs: string[] = [];
  const pending: string[] = [];
  let current: RunningJob | null = null;
  let last: FinishedJob | null = null;
  let busy = false;

  const status = (): SnapRaidStatus => ({
    hasErrors: false,
    parityUpToDate: pending.length === 0,
    newFiles: 0,
    modifiedFiles: 0,
    deletedFiles: 0,
    disks: disks.map((name) => ({
      name,
      files: 1,
      fragmentedFiles: 0,
      excessFragments: 0,
      wastedGB: 0,
      usedGB: 1,
      freeGB: 9,
      usePercent: 10,
    })),
    diskIssues: options.diskIssues ?? [],
    rawOutput: "",
  });

  const diff = (): DiffReport => ({
    files: pending.map((name) => ({ status: "added", name, disk: disks[0] })),
    totalFiles: pending.length,
    equalFiles: 0,
    newFiles: pending.length,
    modifiedFiles: 0,
    deletedFiles: options.deletedFiles ?? 0,
    movedFiles: 0,
    copiedFiles: 0,
    restoredFiles: 0,
    timestamp: new Date().toISOString(),
    rawOutput: "",
  });

  return {
    kind: "cli",
    jobs,
    addFile: (name) => pending.push(name),
    setBusy: (value) => {
      busy = value;
    },

    runJob: async ({ command, configPath, args = [], onOutput, afterRun }) => {
      const processId = `${command}-${jobs.length}`;
      const timestamp = new Date().toISOString();
      jobs.push([command, ...args].join(" "));
      current = { command, configPath, startTime: timestamp, processId };
      onOutput?.(`${command} running\n`);

      const result = options.results?.[command] ?? "ok";
      if (command === "sync" && result === "ok") pending.length = 0;
      const exitCode = result === "ok" || result === "warning" ? 0 : 1;
      const outcome: JobOutcome = {
        output: { command: `snapraid ${command}`, output: "", timestamp, exitCode, aborted: result === "aborted" },
        report: { command, result, durationSec: 0, ioErrors: 0, dataErrors: 0, log: "" },
      };
      try {
        await afterRun?.(outcome);
      } finally {
        current = null;
        last = { command, processId, exitCode, aborted: result === "aborted", finishedAt: new Date().toISOString() };
      }
      return outcome;
    },

    abortJob: (processId) => current?.processId === processId,
    currentJob: () => current,
    currentOutput: () => "",
    lastJob: () => last,
    onProgress: () => {},

    readStatus: () => {
      if (current) return Promise.reject(new EngineBusyError("job"));
      if (busy) return Promise.reject(new EngineBusyError("locked"));
      return Promise.resolve({ status: status(), exitCode: 0, log: "" });
    },
    readDiff: () => Promise.resolve(diff()),
    readSmart: () => Promise.resolve({ disks: [], rawOutput: "", exitCode: 0 }),
    readPowerStates: () =>
      Promise.resolve({
        disks: disks.map((name) => ({ name, device: "", status: "Active" as const })),
        timestamp: new Date().toISOString(),
        rawOutput: "",
      }),
  };
};
