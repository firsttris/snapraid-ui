// Reports only the SnapRAID CLI gives, whatever engine runs the jobs (engine/engine.ts):
// they read the content file or the devices, snapraid-daemon has no API for them
import type { DevicesReport, DupReport, ListReport } from "@shared/types.ts";
import { executeSnapraidCommand } from "./executors/command-executor.ts";
import { parseDevicesOutput } from "./parsers/devices-parser.ts";
import { LIST_ARGS, parseListOutput } from "./parsers/list-parser.ts";
import { parseDupOutput } from "./parsers/dup-parser.ts";
import { STRUCTURED_LOG_ARGS, splitStructuredOutput } from "./parsers/structured-log.ts";

/**
 * Run a SnapRAID command with the structured log on stderr.
 * Returns the structured log and the human readable output.
 */
const runStructured = async (args: string[]): Promise<{ log: string, text: string }> => {
  const { stdout, stderr } = await executeSnapraidCommand([...args, ...STRUCTURED_LOG_ARGS]);
  const { log, text } = splitStructuredOutput(stderr);
  return { log, text: [stdout, text].filter(part => part.trim()).join('\n') };
};

export const createSnapRaidRunner = () => {
  return {
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
  };
};

export type SnapRaidRunner = ReturnType<typeof createSnapRaidRunner>;
