import type { SnapRaidCommand, CommandOutput, RunningJob, FinishedJob, DevicesReport, ListReport, DiffReport, DupReport, DiskIssue } from "@shared/types.ts";
import type { LogManager } from "./log-manager.ts";
import { executeCommand, abortCommand, getCurrentJob, getLastJob, executeSnapraidCommand, setLogManager } from "./executors/command-executor.ts";
import { parseDevicesOutput } from "./parsers/devices-parser.ts";
import { parseListOutput } from "./parsers/list-parser.ts";
import { parseDupOutput } from "./parsers/dup-parser.ts";
import { parseDiffOutput } from "./parsers/diff-parser.ts";
import { STRUCTURED_LOG_ARGS, splitStructuredOutput } from "./parsers/structured-log.ts";
import { LIST_ARGS } from "./parsers/list-parser.ts";
import { findDiskIssues } from "./disk-check.ts";

/**
 * Run a SnapRAID command with the structured log on stderr.
 * Returns the structured log and the human readable output.
 */
const runStructured = async (args: string[]): Promise<{ log: string, text: string }> => {
  const { stdout, stderr } = await executeSnapraidCommand([...args, ...STRUCTURED_LOG_ARGS]);
  const { log, text } = splitStructuredOutput(stderr);
  return { log, text: [stdout, text].filter(part => part.trim()).join('\n') };
};

/**
 * Create a SnapRAID runner with functional API
 */
export const createSnapRaidRunner = () => {
  return {
    /**
     * Set log manager for automatic logging
     */
    setLogManager: (logManager: LogManager): void => {
      setLogManager(logManager);
    },

    /**
     * Execute a SnapRAID command and stream output
     */
    executeCommand: (
      command: SnapRaidCommand,
      configPath: string,
      onOutput: (chunk: string) => void,
      additionalArgs: string[] = [],
      afterRun?: (result: CommandOutput) => Promise<void>
    ): Promise<CommandOutput> => {
      return executeCommand(command, configPath, onOutput, additionalArgs, afterRun);
    },

    /**
     * Abort a running command
     */
    abortCommand: (processId: string): boolean => {
      return abortCommand(processId);
    },

    /**
     * Get current running job
     */
    getCurrentJob: (): RunningJob | null => {
      return getCurrentJob();
    },

    /**
     * Get the outcome of the last finished job
     */
    getLastJob: (): FinishedJob | null => {
      return getLastJob();
    },

    /**
     * Run devices command
     */
    runDevices: async (configPath: string): Promise<DevicesReport> => {
      const { stdout } = await executeSnapraidCommand(["devices", "-c", configPath]);

      return {
        devices: parseDevicesOutput(stdout),
        timestamp: new Date().toISOString(),
        rawOutput: stdout,
      };
    },

    /**
     * Run list command
     */
    runList: async (configPath: string): Promise<ListReport> => {
      const { log, text } = await runStructured(["list", "-c", configPath, ...LIST_ARGS]);

      const { files, totalFiles, totalSize, totalLinks } = parseListOutput(log);

      return {
        files,
        totalFiles,
        totalSize,
        totalLinks,
        timestamp: new Date().toISOString(),
        rawOutput: text,
      };
    },

    /**
     * Run dup command, it only reads the content file
     */
    runDup: async (configPath: string): Promise<DupReport> => {
      const { log, text } = await runStructured(["dup", "-c", configPath]);

      const { duplicates, totalSize } = parseDupOutput(log);

      return {
        duplicates,
        totalDuplicates: duplicates.length,
        totalSize,
        timestamp: new Date().toISOString(),
        rawOutput: text,
      };
    },

    /**
     * Disks that are missing, empty or on another filesystem than the content file recorded.
     * status only reads the content file, so it does not touch the array.
     */
    checkDisks: async (configPath: string): Promise<DiskIssue[]> => {
      const { log } = await runStructured(["status", "-c", configPath]);
      return findDiskIssues(log);
    },

    /**
     * Run diff command
     */
    runDiff: async (configPath: string): Promise<DiffReport> => {
      const { log, text } = await runStructured(["diff", "-c", configPath]);

      const { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles } =
        parseDiffOutput(log);

      return {
        files,
        totalFiles,
        equalFiles,
        newFiles,
        modifiedFiles,
        deletedFiles,
        movedFiles,
        copiedFiles,
        restoredFiles,
        failed: !/^summary:exit:/m.test(log),
        timestamp: new Date().toISOString(),
        rawOutput: text,
      };
    },
  };
};

export type SnapRaidRunner = ReturnType<typeof createSnapRaidRunner>;


