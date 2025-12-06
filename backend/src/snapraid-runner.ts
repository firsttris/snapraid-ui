import type { SnapRaidCommand, CommandOutput, SnapRaidStatus, RunningJob } from "@shared/types.ts";
import { LogManager } from "./log-manager.ts";

export class SnapRaidRunner {
  private processes = new Map<string, Deno.ChildProcess>();
  private currentJob: RunningJob | null = null;
  private logManager: LogManager | null = null;

  /**
   * Set log manager for automatic logging
   */
  setLogManager(logManager: LogManager): void {
    this.logManager = logManager;
  }

  /**
   * Prepare log path and ensure directory exists
   */
  private async prepareLogPath(command: SnapRaidCommand): Promise<string> {
    if (!this.logManager) throw new Error("Log manager not configured");
    await this.logManager.ensureLogDirectory();
    return this.logManager.getLogPath(command);
  }

  /**
   * Build command arguments functionally
   */
  private buildCommandArgs(
    command: SnapRaidCommand,
    configPath: string,
    additionalArgs: string[],
    logPath?: string
  ): string[] {
    const baseArgs = [command, "-c", configPath];
    const logArgs = logPath ? ["-l", logPath] : [];
    return [...baseArgs, ...logArgs, ...additionalArgs];
  }

  /**
   * Async generator for reading stream chunks
   */
  private async *readStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Uint8Array> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  }

  /**
   * Execute a SnapRAID command and stream output
   */
  async executeCommand(
    command: SnapRaidCommand,
    configPath: string,
    onOutput: (chunk: string) => void,
    additionalArgs: string[] = []
  ): Promise<CommandOutput> {
    const processId = `${command}-${Date.now()}`;
    
    // Add log file if log manager is configured
    const logPath = this.logManager ? await this.prepareLogPath(command) : undefined;
    
    const args = this.buildCommandArgs(command, configPath, additionalArgs, logPath);
    console.log(`Executing: snapraid ${args.join(" ")}`);

    // Set current job
    this.currentJob = {
      command,
      configPath,
      startTime: new Date().toISOString(),
      processId,
    };

    const cmd = new Deno.Command("snapraid", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    this.processes.set(processId, process);

    let fullOutput = "";
    const timestamp = new Date().toISOString();

    try {
      const decoder = new TextDecoder();
      
      // Create stream readers as closures
      const createStreamReader = (reader: ReadableStreamDefaultReader<Uint8Array>) => 
        async () => {
          const chunks: string[] = [];
          for await (const value of this.readStream(reader)) {
            const chunk = decoder.decode(value);
            chunks.push(chunk);
            onOutput(chunk);
          }
          return chunks.join("");
        };

      const [stdoutContent, stderrContent] = await Promise.all([
        createStreamReader(process.stdout.getReader())(),
        createStreamReader(process.stderr.getReader())(),
      ]);
      
      fullOutput = stdoutContent + stderrContent;

      const status = await process.status;
      this.processes.delete(processId);
      this.currentJob = null; // Clear current job

      return {
        command: `snapraid ${args.join(" ")}`,
        output: fullOutput,
        timestamp,
        exitCode: status.code,
      };
    } catch (error) {
      this.processes.delete(processId);
      this.currentJob = null; // Clear current job on error
      throw error;
    }
  }

  /**
   * Abort a running command
   */
  abortCommand(processId: string): boolean {
    const process = this.processes.get(processId);
    if (process) {
      process.kill("SIGTERM");
      this.processes.delete(processId);
      this.currentJob = null; // Clear current job
      return true;
    }
    return false;
  }

  /**
   * Get current running job
   */
  getCurrentJob(): RunningJob | null {
    return this.currentJob;
  }

  /**
   * Parse SnapRAID status/diff output
   */
  static parseStatusOutput(output: string): SnapRaidStatus {
    const status: SnapRaidStatus = {
      hasErrors: false,
      parityUpToDate: false,
      newFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      rawOutput: output,
    };

    // Check for errors - but "No error detected" means OK
    if (output.includes("No error detected")) {
      status.hasErrors = false;
    } else {
      status.hasErrors = output.toLowerCase().includes("error") || 
                         output.toLowerCase().includes("warning") ||
                         output.includes("bad blocks");
    }

    // Parse "status" command specific info
    // Check if sync is in progress
    status.syncInProgress = output.includes("sync is in progress") && !output.includes("No sync is in progress");

    // Parse scrub percentage: "100% of the array is not scrubbed" or "50% of the array is scrubbed"
    const notScrubbed = output.match(/(\d+)%\s+of the array is not scrubbed/i);
    if (notScrubbed) {
      status.scrubPercentage = 100 - parseInt(notScrubbed[1], 10);
    }
    const isScrubbed = output.match(/(\d+)%\s+of the array is scrubbed/i);
    if (isScrubbed) {
      status.scrubPercentage = parseInt(isScrubbed[1], 10);
    }

    // Parse oldest scrub: "The oldest block was scrubbed 5 days ago"
    const oldestScrub = output.match(/oldest block was scrubbed (\d+) days? ago/i);
    if (oldestScrub) {
      status.oldestScrubDays = parseInt(oldestScrub[1], 10);
    }

    // Parse fragmented files from status table
    const fragmentMatch = output.match(/Fragmented[\s\S]*?Files[\s\S]*?(\d+)/);
    if (fragmentMatch) {
      status.fragmentedFiles = parseInt(fragmentMatch[1], 10);
    }

    // Parse wasted space
    const wastedMatch = output.match(/Wasted[\s\S]*?GB[\s\S]*?([\d.]+)/);
    if (wastedMatch) {
      status.wastedGB = parseFloat(wastedMatch[1]);
    }

    // Check parity status
    // For "status" command: check if no errors and no sync in progress
    // For "diff" command: check if no differences
    status.parityUpToDate = (output.includes("No error detected") && !status.syncInProgress) ||
                            output.includes("Everything OK") ||
                            output.includes("Nothing to do") ||
                            output.includes("No differences") ||
                            (output.includes("equal") && !output.match(/(\d+)\s+(added|removed|updated)/i));

    // Parse "diff" command output
    // Example: "5 equal, 3 added, 2 removed, 1 updated"
    const summaryMatch = output.match(/(\d+)\s+equal.*?(\d+)\s+added.*?(\d+)\s+removed.*?(\d+)\s+updated/is);
    if (summaryMatch) {
      status.newFiles = parseInt(summaryMatch[2], 10);
      status.deletedFiles = parseInt(summaryMatch[3], 10);
      status.modifiedFiles = parseInt(summaryMatch[4], 10);
      return status;
    }

    // Alternative parsing for individual lines (diff command)
    const addedMatch = output.match(/(\d+)\s+(added|new)/i);
    if (addedMatch) status.newFiles = parseInt(addedMatch[1], 10);

    const updatedMatch = output.match(/(\d+)\s+(updated|modified|changed)/i);
    if (updatedMatch) status.modifiedFiles = parseInt(updatedMatch[1], 10);

    const removedMatch = output.match(/(\d+)\s+(removed|deleted)/i);
    if (removedMatch) status.deletedFiles = parseInt(removedMatch[1], 10);

    return status;
  }
}
