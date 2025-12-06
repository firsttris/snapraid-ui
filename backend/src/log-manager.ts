import { join } from "jsr:@std/path";
import { expandGlob } from "jsr:@std/fs";
import type { SnapRaidCommand } from "./types.ts";

export interface LogFile {
  filename: string;
  path: string;
  command: SnapRaidCommand;
  timestamp: Date;
  size: number;
}

export class LogManager {
  constructor(private logDirectory: string) {}

  /**
   * Expand ~ to home directory
   */
  private expandPath(path: string): string {
    if (path.startsWith("~/")) {
      const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
      return join(home, path.slice(2));
    }
    return path;
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory(): Promise<void> {
    const expandedPath = this.expandPath(this.logDirectory);
    try {
      await Deno.mkdir(expandedPath, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
  }

  /**
   * Generate log file path for a command
   * Format: <command>-YYYYMMDD-HHMMSS.log
   */
  getLogPath(command: SnapRaidCommand): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
    const filename = `${command}-${dateStr}-${timeStr}.log`;
    return join(this.expandPath(this.logDirectory), filename);
  }

  /**
   * List all log files
   */
  async listLogs(): Promise<LogFile[]> {
    const expandedPath = this.expandPath(this.logDirectory);
    const logs: LogFile[] = [];

    try {
      for await (const entry of expandGlob(`${expandedPath}/*.log`)) {
        if (!entry.isFile) continue;

        const filename = entry.name;
        const stat = await Deno.stat(entry.path);

        // Parse filename: <command>-YYYYMMDD-HHMMSS.log
        const match = filename.match(/^([\w-]+)-(\d{8})-(\d{6})\.log$/);
        if (match) {
          const [, command, dateStr, timeStr] = match;
          const year = parseInt(dateStr.slice(0, 4));
          const month = parseInt(dateStr.slice(4, 6)) - 1;
          const day = parseInt(dateStr.slice(6, 8));
          const hour = parseInt(timeStr.slice(0, 2));
          const minute = parseInt(timeStr.slice(2, 4));
          const second = parseInt(timeStr.slice(4, 6));

          logs.push({
            filename,
            path: entry.path,
            command: command as SnapRaidCommand,
            timestamp: new Date(year, month, day, hour, minute, second),
            size: stat.size,
          });
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }

    // Sort by timestamp descending (newest first)
    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Read log file content
   */
  async readLog(filename: string): Promise<string> {
    const logPath = join(this.expandPath(this.logDirectory), filename);
    try {
      return await Deno.readTextFile(logPath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Log file not found: ${filename}`);
      }
      throw error;
    }
  }

  /**
   * Delete old log files based on maxFiles and maxAge
   */
  async rotateLogs(maxFiles: number, maxAge: number): Promise<number> {
    const logs = await this.listLogs();
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // days to milliseconds
    let deleted = 0;

    for (const log of logs) {
      const shouldDelete =
        // Delete if exceeds max files count
        (maxFiles > 0 && logs.indexOf(log) >= maxFiles) ||
        // Delete if older than max age
        (maxAge > 0 && now - log.timestamp.getTime() > maxAgeMs);

      if (shouldDelete) {
        try {
          await Deno.remove(log.path);
          deleted++;
        } catch (error) {
          console.error(`Failed to delete log file ${log.filename}:`, error);
        }
      }
    }

    return deleted;
  }

  /**
   * Delete a specific log file
   */
  async deleteLog(filename: string): Promise<void> {
    const logPath = join(this.expandPath(this.logDirectory), filename);
    try {
      await Deno.remove(logPath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Log file not found: ${filename}`);
      }
      throw error;
    }
  }
}
