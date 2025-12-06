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
    // Note: "X% of the array is not scrubbed" means (100-X)% IS scrubbed
    const notScrubbed = output.match(/(\d+)%\s+of\s+the\s+array\s+is\s+not\s+scrubbed/i);
    if (notScrubbed) {
      const notScrubbedPercent = parseInt(notScrubbed[1], 10);
      status.scrubPercentage = 100 - notScrubbedPercent;
    } else {
      const isScrubbed = output.match(/(\d+)%\s+of\s+the\s+array\s+is\s+scrubbed/i);
      if (isScrubbed) {
        status.scrubPercentage = parseInt(isScrubbed[1], 10);
      }
    }

    // Parse oldest scrub: "The oldest block was scrubbed 5 days ago"
    const oldestScrub = output.match(/oldest block was scrubbed (\d+) days? ago/i);
    if (oldestScrub) {
      status.oldestScrubDays = parseInt(oldestScrub[1], 10);
    }

    // Parse status table: extract total row (after separator line)
    // Table format:
    //    Files Fragmented Excess  Wasted  Used    Free  Use Name
    //             Files  Fragments  GB      GB      GB
    //       13       0       0   502.5       0     209   0% test1
    //  --------------------------------------------------------------------------
    //       13       0       0   502.5       0     209   0%
    const totalRowMatch = output.match(/^ *-{10,} *$/m);
    if (totalRowMatch) {
      const totalRowIndex = totalRowMatch.index! + totalRowMatch[0].length;
      const remainingOutput = output.slice(totalRowIndex);
      const totalLine = remainingOutput.split('\n')[1]; // First line after separator
      
      if (totalLine) {
        // Parse columns: Files FragmentedFiles ExcessFragments WastedGB UsedGB FreeGB Use%
        const columns = totalLine.trim().split(/\s+/);
        if (columns.length >= 7) {
          const fragmentedFiles = parseInt(columns[1], 10);
          const wastedGB = parseFloat(columns[3]);
          const freeGB = parseFloat(columns[5]);
          
          if (!isNaN(fragmentedFiles)) status.fragmentedFiles = fragmentedFiles;
          if (!isNaN(wastedGB)) status.wastedGB = wastedGB;
          if (!isNaN(freeGB)) status.freeSpaceGB = freeGB;
        }
      }
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
    // Format:
    //       11 equal
    //        1 added
    //        1 removed
    //        0 updated
    //        0 moved
    //        0 copied
    //        1 restored
    const diffStats: Record<string, number> = {};
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+(equal|added|removed|updated|moved|copied|restored)/);
      if (match) {
        diffStats[match[2]] = parseInt(match[1], 10);
      }
    }

    // If we found diff stats, use them
    if (Object.keys(diffStats).length > 0) {
      status.equalFiles = diffStats.equal || 0;
      status.newFiles = diffStats.added || 0;
      status.deletedFiles = diffStats.removed || 0;
      status.modifiedFiles = diffStats.updated || 0;
      status.movedFiles = diffStats.moved || 0;
      status.copiedFiles = diffStats.copied || 0;
      status.restoredFiles = diffStats.restored || 0;
    }

    return status;
  }
}
