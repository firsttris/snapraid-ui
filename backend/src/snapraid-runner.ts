import type { SnapRaidCommand, CommandOutput, SnapRaidStatus, RunningJob, DevicesReport, DeviceInfo, ListReport, SnapRaidFileInfo, CheckReport, CheckFileInfo, DiffReport, DiffFileInfo, DiskStatusInfo, ScrubHistoryPoint } from "@shared/types.ts";
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
      disks: [],
      scrubHistory: [],
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

    // Parse scrub age details: "The oldest block was scrubbed 5 days ago, the median 3, the newest 0."
    const scrubAgeMatch = output.match(/oldest block was scrubbed (\d+) days? ago,?\s+the median (\d+),?\s+the newest (\d+)/i);
    if (scrubAgeMatch) {
      status.oldestScrubDays = parseInt(scrubAgeMatch[1], 10);
      status.medianScrubDays = parseInt(scrubAgeMatch[2], 10);
      status.newestScrubDays = parseInt(scrubAgeMatch[3], 10);
    } else {
      // Fallback to just oldest
      const oldestScrub = output.match(/oldest block was scrubbed (\d+) days? ago/i);
      if (oldestScrub) {
        status.oldestScrubDays = parseInt(oldestScrub[1], 10);
      }
    }

    // Parse individual disk rows from status table
    // Table format:
    //    Files Fragmented Excess  Wasted  Used    Free  Use Name
    //             Files  Fragments  GB      GB      GB
    //       13       0       0   502.5       0     209   0% test1
    //        0       0       0       -       0       -   -  test2
    //  --------------------------------------------------------------------------
    //       13       0       0   502.5       0     209   0%
    const lines = output.split('\n');
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect table header
      if (line.includes('Files') && line.includes('Fragmented') && line.includes('Wasted')) {
        inTable = true;
        i++; // Skip the "Files Fragments" subheader
        continue;
      }
      
      // Detect table end (separator line)
      if (line.match(/^ *-{10,} *$/)) {
        inTable = false;
        // The line after separator is the total
        if (i + 1 < lines.length) {
          const totalLine = lines[i + 1].trim();
          const totalCols = totalLine.split(/\s+/);
          if (totalCols.length >= 7) {
            status.totalFiles = parseInt(totalCols[0], 10) || 0;
            status.fragmentedFiles = parseInt(totalCols[1], 10) || 0;
            status.wastedGB = parseFloat(totalCols[3]) || 0;
            status.totalUsedGB = parseFloat(totalCols[4]) || 0;
            status.totalFreeGB = parseFloat(totalCols[5]) || 0;
          }
        }
        continue;
      }
      
      // Parse disk rows
      if (inTable && line.trim()) {
        // Format: "      13       0       0   502.5       0     209   0% test1"
        const cols = line.trim().split(/\s+/);
        if (cols.length >= 8) {
          const diskInfo: DiskStatusInfo = {
            name: cols.slice(7).join(' '), // Everything after % is the disk name
            files: parseInt(cols[0], 10) || 0,
            fragmentedFiles: parseInt(cols[1], 10) || 0,
            excessFragments: parseInt(cols[2], 10) || 0,
            wastedGB: cols[3] === '-' ? 0 : parseFloat(cols[3]) || 0,
            usedGB: cols[4] === '-' ? 0 : parseFloat(cols[4]) || 0,
            freeGB: cols[5] === '-' ? 0 : parseFloat(cols[5]) || 0,
            usePercent: cols[6] === '-' ? 0 : parseInt(cols[6], 10) || 0,
          };
          status.disks!.push(diskInfo);
        }
      }
    }

    // Parse scrub history chart
    // Format (ASCII art):
    // 94%|o                                                                     
    //    |o                                                                     
    // ...
    //  0%|o_____o______________________________________________________________o
    //     0                    days ago of the last scrub/sync                 0
    const chartLines: string[] = [];
    let foundChartStart = false;
    
    for (const line of lines) {
      // Detect chart lines (start with percentage or spaces followed by |)
      if (line.match(/^\s*\d+%\|/) || (foundChartStart && line.match(/^\s+\|/))) {
        chartLines.push(line);
        foundChartStart = true;
      } else if (foundChartStart && line.match(/^\s+\d+\s+days ago/)) {
        // End of chart
        break;
      } else if (foundChartStart) {
        // End of chart
        break;
      }
    }
    
    // Parse chart data points
    if (chartLines.length > 0) {
      const scrubHistory: ScrubHistoryPoint[] = [];
      
      for (const chartLine of chartLines) {
        const percentMatch = chartLine.match(/^\s*(\d+)%\|/);
        if (percentMatch) {
          const percentage = parseInt(percentMatch[1], 10);
          
          // Extract position of 'o' markers (representing data points)
          const positions: number[] = [];
          for (let i = 0; i < chartLine.length; i++) {
            if (chartLine[i] === 'o') {
              positions.push(i);
            }
          }
          
          // Map positions to approximate days ago (0 to max days)
          // The chart is roughly 70 chars wide, 0 days at left, max at right
          const chartWidth = 70;
          const maxDays = status.oldestScrubDays || 30;
          
          for (const pos of positions) {
            const relativePos = (pos - chartLine.indexOf('|') - 1) / chartWidth;
            const daysAgo = Math.round(relativePos * maxDays);
            scrubHistory.push({ daysAgo, percentage });
          }
        }
      }
      
      status.scrubHistory = scrubHistory;
    }

    // Legacy fallback for backward compatibility
    if (!status.freeSpaceGB && status.totalFreeGB) {
      status.freeSpaceGB = status.totalFreeGB;
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

  /**
   * Parse devices output
   * Format: "259:0   /dev/nvme0n1    259:2   /dev/nvme0n1p2  test1"
   */
  static parseDevicesOutput(output: string): DeviceInfo[] {
    const devices: DeviceInfo[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Loading') || trimmed.startsWith('Listing')) {
        continue;
      }

      // Split by whitespace and parse device info
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        devices.push({
          majorMinor: parts[0],
          device: parts[1],
          partMajorMinor: parts[2],
          partition: parts[3],
          diskName: parts.slice(4).join(' '),
        });
      }
    }

    return devices;
  }

  /**
   * Parse list output
   * Format: "       76849 2025/12/01 07:54 filename.xlsx"
   */
  static parseListOutput(output: string): { files: SnapRaidFileInfo[], totalFiles: number, totalSize: number, totalLinks: number } {
    const files: SnapRaidFileInfo[] = [];
    const lines = output.split('\n');
    let totalFiles = 0;
    let totalSize = 0;
    let totalLinks = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip header/footer lines
      if (!trimmed || 
          trimmed.startsWith('Loading') || 
          trimmed.startsWith('Listing') ||
          trimmed.startsWith('files, for') ||
          trimmed.startsWith('links')) {
        continue;
      }

      // Parse summary lines
      const filesMatch = trimmed.match(/^(\d+)\s+files?,\s+for\s+(\d+(?:\.\d+)?)\s+([KMGT]?B)/);
      if (filesMatch) {
        totalFiles = parseInt(filesMatch[1], 10);
        continue;
      }

      const linksMatch = trimmed.match(/^(\d+)\s+links?/);
      if (linksMatch) {
        totalLinks = parseInt(linksMatch[1], 10);
        continue;
      }

      // Parse file lines: size date time path
      // Match format: spaces, number, spaces, date, spaces, time, spaces, filename
      const fileMatch = trimmed.match(/^(\d+)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
      if (fileMatch) {
        const size = parseInt(fileMatch[1], 10);
        files.push({
          size,
          date: fileMatch[2],
          time: fileMatch[3],
          name: fileMatch[4],
        });
        totalSize += size;
      }
    }

    return { files, totalFiles, totalSize, totalLinks };
  }

  /**
   * Parse check output
   * Format example:
   * Missing file '/path/to/file.log'.
   * recoverable status-20251206-094002.log
   * 100% completed, 67 MB accessed in 0:00
   * 
   *        1 errors
   *        0 unrecoverable errors
   */
  static parseCheckOutput(output: string): { files: CheckFileInfo[], totalFiles: number, errorCount: number, rehashCount: number, okCount: number } {
    const files: CheckFileInfo[] = [];
    const lines = output.split('\n');
    let errorCount = 0;
    let rehashCount = 0;
    let okCount = 0;
    let totalFiles = 0;
    const seenFiles = new Set<string>(); // Track files we've already seen to avoid duplicates

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Skip header/progress lines
      if (!trimmed || 
          trimmed.startsWith('Self test') ||
          trimmed.startsWith('Loading') || 
          trimmed.startsWith('Searching') ||
          trimmed.startsWith('Using') ||
          trimmed.startsWith('Initializing') ||
          trimmed.startsWith('Selecting') ||
          trimmed.startsWith('Checking') ||
          trimmed.startsWith('WARNING') ||
          trimmed.includes('% completed')) {
        continue;
      }

      // Parse error summary line: "1 errors"
      const errorsMatch = trimmed.match(/^(\d+)\s+errors?$/);
      if (errorsMatch) {
        // Use the summary line as the authoritative error count
        errorCount = parseInt(errorsMatch[1], 10);
        continue;
      }

      // Parse unrecoverable errors: "0 unrecoverable errors"
      if (trimmed.includes('unrecoverable errors')) {
        continue;
      }

      // Parse missing file: "Missing file '/path/to/file.log'."
      const missingMatch = trimmed.match(/^Missing file '(.+)'\.$/);
      if (missingMatch) {
        const filePath = missingMatch[1];
        
        // Skip if we've already seen this file (avoid duplicates from stdout/stderr)
        if (seenFiles.has(filePath)) {
          continue;
        }
        seenFiles.add(filePath);
        
        // Check next line for recoverable/unrecoverable status
        let errorType = 'Missing file';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith('recoverable ') || nextLine.startsWith('unrecoverable ')) {
            errorType = nextLine.split(/\s+/)[0];
            i++; // Skip next line as we've processed it
          }
        }
        
        files.push({
          status: 'ERROR',
          name: filePath,
          error: errorType,
        });
        totalFiles++;
        continue;
      }

      // Parse files that need rehashing
      if (trimmed.includes('rehash')) {
        files.push({
          status: 'REHASH',
          name: trimmed,
          error: 'Needs rehashing',
        });
        rehashCount++;
        totalFiles++;
        continue;
      }

      // Parse other error patterns
      if (trimmed.toLowerCase().includes('error') && !trimmed.includes('errors')) {
        files.push({
          status: 'ERROR',
          name: trimmed,
          error: 'Check error',
        });
        totalFiles++;
      }
    }

    // Calculate OK count
    okCount = totalFiles - errorCount - rehashCount;
    if (okCount < 0) okCount = 0;

    return { files, totalFiles, errorCount, rehashCount, okCount };
  }

  static parseDiffOutput(output: string): { 
    files: DiffFileInfo[], 
    totalFiles: number, 
    equalFiles: number,
    newFiles: number, 
    modifiedFiles: number, 
    deletedFiles: number,
    movedFiles: number,
    copiedFiles: number,
    restoredFiles: number
  } {
    const files: DiffFileInfo[] = [];
    const lines = output.split('\n');
    let equalFiles = 0;
    let newFiles = 0;
    let modifiedFiles = 0;
    let deletedFiles = 0;
    let movedFiles = 0;
    let copiedFiles = 0;
    let restoredFiles = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip header/progress lines
      if (!trimmed || 
          trimmed.startsWith('Self test') ||
          trimmed.startsWith('Loading') || 
          trimmed.startsWith('Comparing') ||
          trimmed.startsWith('Scanning') ||
          trimmed.startsWith('Using') ||
          trimmed.startsWith('Saving') ||
          trimmed.includes('% completed')) {
        continue;
      }

      // Parse summary lines: "   1234 equal"
      const equalMatch = trimmed.match(/^\s*(\d+)\s+equal/);
      if (equalMatch) {
        equalFiles = parseInt(equalMatch[1], 10);
        continue;
      }

      const addedMatch = trimmed.match(/^\s*(\d+)\s+added/);
      if (addedMatch) {
        newFiles = parseInt(addedMatch[1], 10);
        continue;
      }

      const removedMatch = trimmed.match(/^\s*(\d+)\s+removed/);
      if (removedMatch) {
        deletedFiles = parseInt(removedMatch[1], 10);
        continue;
      }

      const updatedMatch = trimmed.match(/^\s*(\d+)\s+updated/);
      if (updatedMatch) {
        modifiedFiles = parseInt(updatedMatch[1], 10);
        continue;
      }

      const movedMatch = trimmed.match(/^\s*(\d+)\s+moved/);
      if (movedMatch) {
        movedFiles = parseInt(movedMatch[1], 10);
        continue;
      }

      const copiedMatch = trimmed.match(/^\s*(\d+)\s+copied/);
      if (copiedMatch) {
        copiedFiles = parseInt(copiedMatch[1], 10);
        continue;
      }

      const restoredMatch = trimmed.match(/^\s*(\d+)\s+restored/);
      if (restoredMatch) {
        restoredFiles = parseInt(restoredMatch[1], 10);
        continue;
      }

      // Parse individual file entries
      // Format can be: "add file.txt" or "upd file.txt" or "restore file.txt" or "remove file.txt" etc.
      const fileMatch = trimmed.match(/^(add|rem|remove|upd|update|updated|move|moved|copy|copied|rest|restore)\s+(.+)$/);
      if (fileMatch) {
        const status = fileMatch[1];
        const fileName = fileMatch[2];
        
        let mappedStatus: DiffFileInfo['status'] = 'equal';
        switch (status) {
          case 'add': mappedStatus = 'added'; break;
          case 'rem': 
          case 'remove': mappedStatus = 'removed'; break;
          case 'upd': 
          case 'update':
          case 'updated': mappedStatus = 'updated'; break;
          case 'move': 
          case 'moved': mappedStatus = 'moved'; break;
          case 'copy': 
          case 'copied': mappedStatus = 'copied'; break;
          case 'rest': 
          case 'restore': mappedStatus = 'restored'; break;
        }
        
        files.push({
          status: mappedStatus,
          name: fileName,
        });
      }
    }

    const totalFiles = equalFiles + newFiles + modifiedFiles + deletedFiles + movedFiles + copiedFiles + restoredFiles;

    return { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles };
  }

  /**
   * Run devices command
   */
  async runDevices(configPath: string): Promise<DevicesReport> {
    const cmd = new Deno.Command("snapraid", {
      args: ["devices", "-c", configPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(stdout);
    const error = new TextDecoder().decode(stderr);

    if (error) {
      console.error("Devices command stderr:", error);
    }

    const devices = SnapRaidRunner.parseDevicesOutput(output);

    return {
      devices,
      timestamp: new Date().toISOString(),
      rawOutput: output,
    };
  }

  /**
   * Run list command
   */
  async runList(configPath: string): Promise<ListReport> {
    const cmd = new Deno.Command("snapraid", {
      args: ["list", "-c", configPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(stdout);
    const error = new TextDecoder().decode(stderr);

    if (error) {
      console.error("List command stderr:", error);
    }

    const { files, totalFiles, totalSize, totalLinks } = SnapRaidRunner.parseListOutput(output);

    return {
      files,
      totalFiles,
      totalSize,
      totalLinks,
      timestamp: new Date().toISOString(),
      rawOutput: output,
    };
  }

  /**
   * Run check command
   */
  async runCheck(configPath: string): Promise<CheckReport> {
    const cmd = new Deno.Command("snapraid", {
      args: ["check", "-c", configPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, stderr } = await cmd.output();
    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    // Combine stdout and stderr for parsing, as errors can appear in either
    const output = stdoutText + '\n' + stderrText;

    if (stderrText) {
      console.log("Check command stderr:", stderrText);
    }

    const { files, totalFiles, errorCount, rehashCount, okCount } = SnapRaidRunner.parseCheckOutput(output);
    
    console.log("Check parsed results:", { files, totalFiles, errorCount, rehashCount, okCount });

    return {
      files,
      totalFiles,
      errorCount,
      rehashCount,
      okCount,
      timestamp: new Date().toISOString(),
      rawOutput: output,
    };
  }

  async runDiff(configPath: string): Promise<DiffReport> {
    const cmd = new Deno.Command("snapraid", {
      args: ["diff", "-c", configPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, stderr } = await cmd.output();
    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    // Combine stdout and stderr for parsing
    const output = stdoutText + '\n' + stderrText;

    if (stderrText) {
      console.log("Diff command stderr:", stderrText);
    }

    const { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles } = 
      SnapRaidRunner.parseDiffOutput(output);
    
    console.log("Diff parsed results:", { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles });

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
  }
}
