import { join } from "@std/path";
import { expandGlob } from "@std/fs";
import type { SnapRaidCommand, LogFile } from "@shared/types.ts";

export interface LogManager {
  ensureLogDirectory(): Promise<void>;
  getLogPath(command: SnapRaidCommand): string;
  listLogs(): Promise<LogFile[]>;
  readLog(filename: string): Promise<string>;
  rotateLogs(maxFiles: number, maxAge: number): Promise<number>;
  deleteLog(filename: string): Promise<void>;
}

/**
 * Expand ~ to home directory
 */
const expandPath = (path: string): string => {
  if (path.startsWith("~/")) {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    return join(home, path.slice(2));
  }
  return path;
};

/**
 * Parse timestamp from log filename parts
 */
const parseLogTimestamp = (dateStr: string, timeStr: string): string => {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const hour = parseInt(timeStr.slice(0, 2));
  const minute = parseInt(timeStr.slice(2, 4));
  const second = parseInt(timeStr.slice(4, 6));
  return new Date(year, month, day, hour, minute, second).toISOString();
};

export const createLogManager = (logDirectory: string): LogManager => {
  /**
   * Ensure log directory exists
   */
  const ensureLogDirectory = async (): Promise<void> => {
    const expandedPath = expandPath(logDirectory);
    try {
      await Deno.mkdir(expandedPath, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
  };

  /**
   * Generate log file path for a command
   * Format: <command>-YYYYMMDD-HHMMSS.log
   */
  const getLogPath = (command: SnapRaidCommand): string => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
    const filename = `${command}-${dateStr}-${timeStr}.log`;
    return join(expandPath(logDirectory), filename);
  };

  /**
   * List all log files
   */
  const listLogs = async (): Promise<LogFile[]> => {
    const expandedPath = expandPath(logDirectory);

    try {
      const entries: Array<{ name: string; path: string }> = [];
      for await (const entry of expandGlob(`${expandedPath}/*.log`)) {
        if (entry.isFile) {
          entries.push({ name: entry.name, path: entry.path });
        }
      }

      const logs = await Promise.all(
        entries.map(async ({ name: filename, path }) => {
          const stat = await Deno.stat(path);
          const match = filename.match(/^([\w-]+)-(\d{8})-(\d{6})\.log$/);
          
          if (!match) return null;
          
          const [, command, dateStr, timeStr] = match;
          const timestamp = parseLogTimestamp(dateStr, timeStr);
          
          return {
            filename,
            path,
            command: command as SnapRaidCommand,
            timestamp,
            size: stat.size,
          };
        })
      );

      return logs
        .filter((log): log is LogFile => log !== null)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  };

  /**
   * Read log file content
   */
  const readLog = async (filename: string): Promise<string> => {
    const logPath = join(expandPath(logDirectory), filename);
    try {
      return await Deno.readTextFile(logPath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Log file not found: ${filename}`);
      }
      throw error;
    }
  };

  /**
   * Delete old log files based on maxFiles and maxAge
   */
  const rotateLogs = async (maxFiles: number, maxAge: number): Promise<number> => {
    const logs = await listLogs();
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // days to milliseconds

    const logsToDelete = logs.filter((log, index) => 
      (maxFiles > 0 && index >= maxFiles) ||
      (maxAge > 0 && now - new Date(log.timestamp).getTime() > maxAgeMs)
    );

    const deleteResults = await Promise.all(
      logsToDelete.map(async (log) => {
        try {
          await Deno.remove(log.path);
          return true;
        } catch (error) {
          console.error(`Failed to delete log file ${log.filename}:`, error);
          return false;
        }
      })
    );

    return deleteResults.filter(result => result).length;
  };

  /**
   * Delete a specific log file
   */
  const deleteLog = async (filename: string): Promise<void> => {
    const logPath = join(expandPath(logDirectory), filename);
    try {
      await Deno.remove(logPath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Log file not found: ${filename}`);
      }
      throw error;
    }
  };

  return {
    ensureLogDirectory,
    getLogPath,
    listLogs,
    readLog,
    rotateLogs,
    deleteLog,
  };
}
