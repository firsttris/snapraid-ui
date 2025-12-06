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
   * Parse SnapRAID status output
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

    // Check for errors
    status.hasErrors = output.toLowerCase().includes("error") || 
                       output.toLowerCase().includes("warning");

    // Check parity status
    status.parityUpToDate = output.includes("Everything OK") ||
                            output.includes("Nothing to do");

    // Extract file counts using regex
    const newMatch = output.match(/(\d+)\s+new/i);
    if (newMatch) status.newFiles = parseInt(newMatch[1], 10);

    const modifiedMatch = output.match(/(\d+)\s+(modified|updated|changed)/i);
    if (modifiedMatch) status.modifiedFiles = parseInt(modifiedMatch[1], 10);

    const deletedMatch = output.match(/(\d+)\s+(deleted|removed)/i);
    if (deletedMatch) status.deletedFiles = parseInt(deletedMatch[1], 10);

    return status;
  }
}
