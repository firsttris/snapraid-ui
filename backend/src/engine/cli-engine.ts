// The engine that runs the SnapRAID CLI itself and reads its structured log
import type { CommandOutput, SnapRaidCommand } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";
import { snapraidCommand } from "../config.ts";
import {
  abortCommand,
  executeCommand,
  getCurrentJob,
  getCurrentOutput,
  getLastJob,
  setLogManager,
  setProgressListener,
} from "../executors/command-executor.ts";
import type { LogManager } from "../log-manager.ts";
import { readRunReport } from "../run-report.ts";
import { findDiskIssues } from "../disk-check.ts";
import { DEMO_MODE, demoProbeLog, demoSmartLog, demoStatusLog } from "../demo.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { parseDiffOutput } from "../parsers/diff-parser.ts";
import { parseProbeOutput } from "../parsers/probe-parser.ts";
import { parseSmartArrayFailure, parseSmartOutput } from "../parsers/smart-parser.ts";
import { parseStatusOutput } from "../parsers/status-parser.ts";
import { isLockedOutput, STRUCTURED_LOG_ARGS, splitStructuredOutput } from "../parsers/structured-log.ts";
import {
  EngineBusyError,
  EngineCommandError,
  EngineUnsupportedError,
  type JobOutcome,
  type SnapRaidEngine,
} from "./engine.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/**
 * Run a SnapRAID command with the structured log on stderr; the log and the human readable output
 */
const runStructured = async (args: string[]): Promise<{ code: number; log: string; stdout: string; text: string }> => {
  const { code, stdout, stderr } = await snapraidCommand([...STRUCTURED_LOG_ARGS, ...args]).output();
  const { log, text } = splitStructuredOutput(decode(stderr));
  return { code, log, stdout: decode(stdout), text };
};

const toOutcome = async (command: SnapRaidCommand, output: CommandOutput): Promise<JobOutcome> => {
  const report = await readRunReport(command, output);
  return {
    output,
    report,
    ...(command === "smart" ? { smart: parseSmartOutput(report.log) } : {}),
  };
};

/**
 * @param logManager where jobs write their log; without one they run without a log file
 */
export const createCliEngine = (logManager: LogManager | null): SnapRaidEngine => {
  if (logManager) setLogManager(logManager);

  return {
    kind: "cli",

    runJob: async ({ command, configPath, args = [], onOutput = () => {}, afterRun }) => {
      let outcome: JobOutcome | undefined;
      const output = await executeCommand(command, configPath, onOutput, args, async (result) => {
        outcome = await toOutcome(command, result);
        await afterRun?.(outcome);
      });
      return outcome ?? await toOutcome(command, output);
    },

    abortJob: abortCommand,
    currentJob: getCurrentJob,
    currentOutput: getCurrentOutput,
    lastJob: getLastJob,
    onProgress: setProgressListener,

    readStatus: async (configPath) => {
      // A running job holds SnapRAID's lock, status would only fail with a fatal error
      if (getCurrentJob()) throw new EngineBusyError("job");
      const { code, log: realLog, stdout, text } = await runStructured(["-c", configPath, "status"]);
      if (isLockedOutput(realLog)) throw new EngineBusyError("locked");
      const log = DEMO_MODE ? demoStatusLog(realLog, await parseSnapRaidConfig(configPath)) : realLog;
      return {
        status: {
          ...parseStatusOutput(log, code === 0 ? stdout : text),
          diskIssues: await findDiskIssues(log),
        },
        exitCode: code,
        log,
      };
    },

    readDiff: async (configPath) => {
      const { log, stdout, text } = await runStructured(["diff", "-c", configPath]);
      return {
        ...parseDiffOutput(log),
        failed: !/^summary:exit:/m.test(log),
        timestamp: new Date().toISOString(),
        rawOutput: [stdout, text].filter((part) => part.trim()).join("\n"),
      };
    },

    readSmart: async (configPath) => {
      if (DEMO_MODE) {
        const log = await demoSmartLog(configPath);
        return {
          disks: parseSmartOutput(log),
          arrayFailureProbability: parseSmartArrayFailure(log),
          rawOutput: log,
          exitCode: 0,
        };
      }
      const { code, log, stdout, text } = await runStructured(["-c", configPath, "smart"]);
      // SnapRAID exits with an error when a disk is FAIL or PREFAIL, the report is complete though
      return {
        disks: parseSmartOutput(log),
        arrayFailureProbability: parseSmartArrayFailure(log),
        rawOutput: stdout,
        exitCode: code,
        ...(code !== 0 ? { error: text || "Failed to get SMART report" } : {}),
      };
    },

    // The log manager finds them in the logs this engine writes
    readLastRuns: () => Promise.resolve(null),

    readPowerStates: async (configPath) => {
      if (DEMO_MODE) {
        const log = await demoProbeLog(configPath);
        return { disks: parseProbeOutput(log), timestamp: new Date().toISOString(), rawOutput: log };
      }
      const { code, log, stdout, text } = await runStructured(["-c", configPath, "probe"]);
      // Unsupported shows in stdout, stderr or both, sometimes with exit code 0
      const combined = `${stdout}\n${text}`.trim();
      if (combined.includes("unsupported") || combined.includes("Probe is unsupported")) {
        throw new EngineUnsupportedError(msg("server_error_probe_unsupported"), combined, code);
      }
      if (code !== 0) throw new EngineCommandError(text || "Failed to probe disk status", combined, code);
      return { disks: parseProbeOutput(log), timestamp: new Date().toISOString(), rawOutput: stdout };
    },
  };
};

