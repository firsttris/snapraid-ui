import type { SnapRaidCommand, CommandOutput, SnapRaidStatus, RunningJob } from "./types.ts";

export class SnapRaidRunner {
  private processes = new Map<string, Deno.ChildProcess>();
  private currentJob: RunningJob | null = null;

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
    const args = [command, "-c", configPath, ...additionalArgs];
    
    console.log(`Executing: snapraid ${args.join(" ")}`);

    // Set current job
    this.currentJob = {
      command,
      configPath,
      startTime: new Date(),
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
    const timestamp = new Date();

    try {
      // Stream stdout
      const stdoutReader = process.stdout.getReader();
      const stderrReader = process.stderr.getReader();
      const decoder = new TextDecoder();

      // Read stdout
      const readStdout = async () => {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          fullOutput += chunk;
          onOutput(chunk);
        }
      };

      // Read stderr
      const readStderr = async () => {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          fullOutput += chunk;
          onOutput(chunk);
        }
      };

      // Wait for both streams
      await Promise.all([readStdout(), readStderr()]);

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
