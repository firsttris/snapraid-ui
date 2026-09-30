import { basename } from "@std/path";
import type { CommandOutput, RunResult, SnapRaidCommand } from "@shared/types.ts";
import { parseRunResult } from "./log-manager.ts";
import { collectKeyValues, parseLogTags, toInt } from "./parsers/structured-log.ts";

/**
 * What a finished run did, read from its structured log
 */
export interface RunReport {
  command: SnapRaidCommand;
  result: RunResult;
  durationSec: number;
  ioErrors: number;
  dataErrors: number;          // Silent data errors, blocks not matching their hash
  recovered?: number;          // fix
  unrecoverable?: number;      // fix/check
  changes?: {                  // sync
    added: number;
    removed: number;
    updated: number;
    moved: number;
    copied: number;
  };
  logFile?: string;
  log: string;
  error?: string;              // Why the command did not run at all
}

// Commands whose log ends with `summary:exit`, a missing one means SnapRAID stopped early
const WRITES_SUMMARY: SnapRaidCommand[] = ["sync", "scrub", "check", "fix", "diff", "status", "list", "pool"];

/**
 * Summarize a structured log; `result` falls back to the exit code when the log is missing
 */
export const parseRunReport = (
  command: SnapRaidCommand,
  log: string,
  fallback: Pick<CommandOutput, "exitCode" | "aborted">,
  durationSec: number,
): RunReport => {
  const summary = collectKeyValues(parseLogTags(log), "summary");
  const count = (key: string) => (summary.has(key) ? toInt(summary.get(key)) : undefined);

  const byExitCode: RunResult = fallback.exitCode === 0 ? "ok" : "error";
  const result: RunResult = fallback.aborted
    ? "aborted"
    : !log
    ? byExitCode
    : WRITES_SUMMARY.includes(command)
    ? parseRunResult(log)
    // touch and smart end without a summary, only a fatal error or Ctrl+C shows in their log
    : parseRunResult(log) === "incomplete"
    ? byExitCode
    : parseRunResult(log);

  return {
    command,
    result,
    durationSec,
    ioErrors: count("error_io") ?? 0,
    dataErrors: count("error_data") ?? 0,
    recovered: count("error_recovered"),
    unrecoverable: count("error_unrecoverable"),
    changes: summary.has("added")
      ? {
        added: toInt(summary.get("added")),
        removed: toInt(summary.get("removed")),
        updated: toInt(summary.get("updated")),
        moved: toInt(summary.get("moved")) + toInt(summary.get("relocated")),
        copied: toInt(summary.get("copied")),
      }
      : undefined,
    log,
  };
};

/**
 * Read the report of a run executed with a log file
 */
export const readRunReport = async (command: SnapRaidCommand, output: CommandOutput): Promise<RunReport> => {
  let log = "";
  try {
    if (output.logPath) log = await Deno.readTextFile(output.logPath);
  } catch {
    // Fall back to the exit code
  }
  const durationSec = Math.round((Date.now() - new Date(output.timestamp).getTime()) / 1000);
  return {
    ...parseRunReport(command, log, output, durationSec),
    logFile: output.logPath ? basename(output.logPath) : undefined,
  };
};

/**
 * A command that could not be started
 */
export const failedReport = (command: SnapRaidCommand, error: string): RunReport => ({
  command,
  result: "error",
  durationSec: 0,
  ioErrors: 0,
  dataErrors: 0,
  log: "",
  error,
});

// ok and warning (files changed while syncing) both leave a usable array
export const isSuccessful = (result: RunResult): boolean => result === "ok" || result === "warning";
