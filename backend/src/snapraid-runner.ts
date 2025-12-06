import type { SnapRaidCommand, CommandOutput, RunningJob, DevicesReport, ListReport, CheckReport, DiffReport } from "@shared/types.ts";
import type { LogManager } from "./log-manager.ts";
import { createCommandExecutor } from "./executors/command-executor.ts";
import { parseStatusOutput } from "./parsers/status-parser.ts";
import { parseDevicesOutput } from "./parsers/devices-parser.ts";
import { parseListOutput } from "./parsers/list-parser.ts";
import { parseCheckOutput } from "./parsers/check-parser.ts";
import { parseDiffOutput } from "./parsers/diff-parser.ts";

/**
 * Create a SnapRAID runner with functional API
 */
export const createSnapRaidRunner = () => {
  const executor = createCommandExecutor();

  return {
    /**
     * Set log manager for automatic logging
     */
    setLogManager: (logManager: LogManager): void => {
      executor.setLogManager(logManager);
    },

    /**
     * Execute a SnapRAID command and stream output
     */
    executeCommand: (
      command: SnapRaidCommand,
      configPath: string,
      onOutput: (chunk: string) => void,
      additionalArgs: string[] = []
    ): Promise<CommandOutput> => {
      return executor.executeCommand(command, configPath, onOutput, additionalArgs);
    },

    /**
     * Abort a running command
     */
    abortCommand: (processId: string): boolean => {
      return executor.abortCommand(processId);
    },

    /**
     * Get current running job
     */
    getCurrentJob: (): RunningJob | null => {
      return executor.getCurrentJob();
    },

    /**
     * Run devices command
     */
    runDevices: async (configPath: string): Promise<DevicesReport> => {
      const { stdout, stderr } = await executor.executeSnapraidCommand(["devices", "-c", configPath]);
      executor.logStderr("Devices", stderr);

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
      const { stdout, stderr } = await executor.executeSnapraidCommand(["list", "-c", configPath]);
      executor.logStderr("List", stderr);

      const { files, totalFiles, totalSize, totalLinks } = parseListOutput(stdout);

      return {
        files,
        totalFiles,
        totalSize,
        totalLinks,
        timestamp: new Date().toISOString(),
        rawOutput: stdout,
      };
    },

    /**
     * Run check command
     */
    runCheck: async (configPath: string): Promise<CheckReport> => {
      const { stdout, stderr } = await executor.executeSnapraidCommand(["check", "-c", configPath]);
      executor.logStderr("Check", stderr);

      const output = stdout + '\n' + stderr;
      const { files, totalFiles, errorCount, rehashCount, okCount } = parseCheckOutput(output);

      return {
        files,
        totalFiles,
        errorCount,
        rehashCount,
        okCount,
        timestamp: new Date().toISOString(),
        rawOutput: output,
      };
    },

    /**
     * Run diff command
     */
    runDiff: async (configPath: string): Promise<DiffReport> => {
      const { stdout, stderr } = await executor.executeSnapraidCommand(["diff", "-c", configPath]);
      executor.logStderr("Diff", stderr);

      const output = stdout + '\n' + stderr;
      const { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles } = 
        parseDiffOutput(output);

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
        timestamp: new Date().toISOString(),
        rawOutput: output,
      };
    },
  };
};

/**
 * Parse SnapRAID status/diff output
 */
export { parseStatusOutput };

export type SnapRaidRunner = ReturnType<typeof createSnapRaidRunner>;


