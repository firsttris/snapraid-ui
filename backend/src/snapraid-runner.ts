import type { SnapRaidCommand, CommandOutput, SnapRaidStatus, RunningJob, DevicesReport, DeviceInfo, ListReport, SnapRaidFileInfo, CheckReport, CheckFileInfo, DiffReport, DiffFileInfo, DiskStatusInfo, ScrubHistoryPoint, SmartDiskInfo, ProbeDiskInfo } from "@shared/types.ts";
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
   * Create stream reader closure
   */
  private createStreamReader = (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    onOutput: (chunk: string) => void
  ) => async (): Promise<string> => {
    const chunks: string[] = [];
    for await (const value of this.readStream(reader)) {
      const chunk = decoder.decode(value);
      chunks.push(chunk);
      onOutput(chunk);
    }
    return chunks.join("");
  };

  /**
   * Read both stdout and stderr streams
   */
  private readProcessStreams = async (
    process: Deno.ChildProcess,
    onOutput: (chunk: string) => void
  ): Promise<string> => {
    const decoder = new TextDecoder();
    const [stdoutContent, stderrContent] = await Promise.all([
      this.createStreamReader(process.stdout.getReader(), decoder, onOutput)(),
      this.createStreamReader(process.stderr.getReader(), decoder, onOutput)(),
    ]);
    return stdoutContent + stderrContent;
  };

  /**
   * Cleanup after process completion
   */
  private cleanupProcess = (processId: string): void => {
    this.processes.delete(processId);
    this.currentJob = null;
  };

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
    const logPath = this.logManager ? await this.prepareLogPath(command) : undefined;
    const args = this.buildCommandArgs(command, configPath, additionalArgs, logPath);
    const timestamp = new Date().toISOString();
    
    console.log(`Executing: snapraid ${args.join(" ")}`);

    this.currentJob = {
      command,
      configPath,
      startTime: timestamp,
      processId,
    };

    const cmd = new Deno.Command("snapraid", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    this.processes.set(processId, process);

    try {
      const fullOutput = await this.readProcessStreams(process, onOutput);
      const status = await process.status;
      this.cleanupProcess(processId);

      return {
        command: `snapraid ${args.join(" ")}`,
        output: fullOutput,
        timestamp,
        exitCode: status.code,
      };
    } catch (error) {
      this.cleanupProcess(processId);
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
   * Check if output has errors
   */
  private static hasErrors = (output: string): boolean => {
    if (output.includes("No error detected")) return false;
    return output.toLowerCase().includes("error") || 
           output.toLowerCase().includes("warning") ||
           output.includes("bad blocks");
  };

  /**
   * Parse scrub percentage from output
   */
  private static parseScrubPercentage = (output: string): number | undefined => {
    const notScrubbed = output.match(/(\d+)%\s+of\s+the\s+array\s+is\s+not\s+scrubbed/i);
    if (notScrubbed) {
      const notScrubbedPercent = parseInt(notScrubbed[1], 10);
      return 100 - notScrubbedPercent;
    }
    
    const isScrubbed = output.match(/(\d+)%\s+of\s+the\s+array\s+is\s+scrubbed/i);
    return isScrubbed ? parseInt(isScrubbed[1], 10) : undefined;
  };

  /**
   * Parse scrub age details
   */
  private static parseScrubAge = (output: string): Pick<SnapRaidStatus, 'oldestScrubDays' | 'medianScrubDays' | 'newestScrubDays'> => {
    const scrubAgeMatch = output.match(/oldest block was scrubbed (\d+) days? ago,?\s+the median (\d+),?\s+the newest (\d+)/i);
    if (scrubAgeMatch) {
      return {
        oldestScrubDays: parseInt(scrubAgeMatch[1], 10),
        medianScrubDays: parseInt(scrubAgeMatch[2], 10),
        newestScrubDays: parseInt(scrubAgeMatch[3], 10),
      };
    }
    
    const oldestScrub = output.match(/oldest block was scrubbed (\d+) days? ago/i);
    return oldestScrub ? { oldestScrubDays: parseInt(oldestScrub[1], 10) } : {};
  };

  /**
   * Parse a single disk row from status table
   */
  private static parseDiskRow = (line: string): DiskStatusInfo | null => {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 8) return null;

    return {
      name: cols.slice(7).join(' '),
      files: parseInt(cols[0], 10) || 0,
      fragmentedFiles: parseInt(cols[1], 10) || 0,
      excessFragments: parseInt(cols[2], 10) || 0,
      wastedGB: cols[3] === '-' ? 0 : parseFloat(cols[3]) || 0,
      usedGB: cols[4] === '-' ? 0 : parseFloat(cols[4]) || 0,
      freeGB: cols[5] === '-' ? 0 : parseFloat(cols[5]) || 0,
      usePercent: cols[6] === '-' ? 0 : parseInt(cols[6], 10) || 0,
    };
  };

  /**
   * Parse total line from status table
   */
  private static parseTotalLine = (line: string): Partial<SnapRaidStatus> => {
    const totalCols = line.trim().split(/\s+/);
    if (totalCols.length < 7) return {};

    return {
      totalFiles: parseInt(totalCols[0], 10) || 0,
      fragmentedFiles: parseInt(totalCols[1], 10) || 0,
      wastedGB: parseFloat(totalCols[3]) || 0,
      totalUsedGB: parseFloat(totalCols[4]) || 0,
      totalFreeGB: parseFloat(totalCols[5]) || 0,
    };
  };

  /**
   * Parse disk table from status output
   */
  private static parseDiskTable = (lines: string[]): { disks: DiskStatusInfo[], totals: Partial<SnapRaidStatus> } => {
    const disks: DiskStatusInfo[] = [];
    const result = lines.reduce((acc, line, index) => {
      // Detect table header
      if (line.includes('Files') && line.includes('Fragmented') && line.includes('Wasted')) {
        return { ...acc, inTable: true, skipNext: true };
      }
      
      // Skip subheader
      if (acc.skipNext) {
        return { ...acc, skipNext: false };
      }
      
      // Detect table end
      if (line.match(/^ *-{10,} *$/)) {
        const totalLine = lines[index + 1];
        const totals = totalLine ? this.parseTotalLine(totalLine) : {};
        return { ...acc, inTable: false, totals };
      }
      
      // Parse disk rows
      if (acc.inTable && line.trim()) {
        const diskInfo = this.parseDiskRow(line);
        if (diskInfo) {
          disks.push(diskInfo);
        }
      }
      
      return acc;
    }, { inTable: false, skipNext: false, totals: {} } as { inTable: boolean, skipNext: boolean, totals: Partial<SnapRaidStatus> });

    return { disks, totals: result.totals };
  };

  /**
   * Parse diff statistics
   */
  private static parseDiffStats = (lines: string[]): Partial<SnapRaidStatus> => {
    const diffStats = lines.reduce((acc, line) => {
      const match = line.match(/^\s*(\d+)\s+(equal|added|removed|updated|moved|copied|restored)/);
      return match ? { ...acc, [match[2]]: parseInt(match[1], 10) } : acc;
    }, {} as Record<string, number>);

    if (Object.keys(diffStats).length === 0) return {};

    return {
      equalFiles: diffStats.equal || 0,
      newFiles: diffStats.added || 0,
      deletedFiles: diffStats.removed || 0,
      modifiedFiles: diffStats.updated || 0,
      movedFiles: diffStats.moved || 0,
      copiedFiles: diffStats.copied || 0,
      restoredFiles: diffStats.restored || 0,
    };
  };

  /**
   * Parse scrub history chart
   */
  private static parseScrubHistory = (lines: string[], oldestScrubDays?: number): ScrubHistoryPoint[] => {
    const chartLines = lines.reduce((acc, line) => {
      if (line.match(/^\s*\d+%\|/) || (acc.foundStart && line.match(/^\s+\|/))) {
        return { foundStart: true, lines: [...acc.lines, line] };
      }
      if (acc.foundStart && (line.match(/^\s+\d+\s+days ago/) || !line.trim())) {
        return { ...acc, foundStart: false };
      }
      return acc;
    }, { foundStart: false, lines: [] as string[] });

    if (chartLines.lines.length === 0) return [];

    const CHART_WIDTH = 70;
    const maxDays = oldestScrubDays || 30;

    return chartLines.lines.flatMap(chartLine => {
      const percentMatch = chartLine.match(/^\s*(\d+)%\|/);
      if (!percentMatch) return [];

      const percentage = parseInt(percentMatch[1], 10);
      const pipeIndex = chartLine.indexOf('|');
      
      return [...chartLine].reduce((positions, char, index) => {
        if (char !== 'o') return positions;
        const relativePos = (index - pipeIndex - 1) / CHART_WIDTH;
        const daysAgo = Math.round(relativePos * maxDays);
        return [...positions, { daysAgo, percentage }];
      }, [] as ScrubHistoryPoint[]);
    });
  };

  /**
   * Check if parity is up to date
   */
  private static isParityUpToDate = (output: string, syncInProgress: boolean): boolean => 
    (output.includes("No error detected") && !syncInProgress) ||
    output.includes("Everything OK") ||
    output.includes("Nothing to do") ||
    output.includes("No differences") ||
    (output.includes("equal") && !output.match(/(\d+)\s+(added|removed|updated)/i));

  /**
   * Parse SnapRAID status/diff output
   */
  static parseStatusOutput(output: string): SnapRaidStatus {
    const lines = output.split('\n');
    const syncInProgress = output.includes("sync is in progress") && !output.includes("No sync is in progress");
    
    const { disks, totals } = this.parseDiskTable(lines);
    const diffStats = this.parseDiffStats(lines);
    const scrubAge = this.parseScrubAge(output);
    const scrubPercentage = this.parseScrubPercentage(output);
    const scrubHistory = this.parseScrubHistory(lines, scrubAge.oldestScrubDays);

    const status: SnapRaidStatus = {
      hasErrors: this.hasErrors(output),
      parityUpToDate: this.isParityUpToDate(output, syncInProgress),
      newFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      disks,
      scrubHistory,
      rawOutput: output,
      syncInProgress,
      scrubPercentage,
      ...scrubAge,
      ...totals,
      ...diffStats,
    };

    // Legacy fallback
    if (!status.freeSpaceGB && status.totalFreeGB) {
      status.freeSpaceGB = status.totalFreeGB;
    }

    return status;
  }

  /**
   * Check if line should be skipped
   */
  private static shouldSkipLine = (line: string, prefixes: string[]): boolean => {
    const trimmed = line.trim();
    return !trimmed || prefixes.some(prefix => trimmed.startsWith(prefix));
  };

  /**
   * Parse devices output
   * Format: "259:0   /dev/nvme0n1    259:2   /dev/nvme0n1p2  test1"
   */
  static parseDevicesOutput(output: string): DeviceInfo[] {
    const skipPrefixes = ['Loading', 'Listing'];
    
    return output.split('\n')
      .filter(line => !this.shouldSkipLine(line, skipPrefixes))
      .map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;
        
        return {
          majorMinor: parts[0],
          device: parts[1],
          partMajorMinor: parts[2],
          partition: parts[3],
          diskName: parts.slice(4).join(' '),
        };
      })
      .filter((device): device is DeviceInfo => device !== null);
  }

  /**
   * Parse file line from list output
   */
  private static parseFileListLine = (line: string): SnapRaidFileInfo | null => {
    const fileMatch = line.trim().match(/^(\d+)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
    if (!fileMatch) return null;

    return {
      size: parseInt(fileMatch[1], 10),
      date: fileMatch[2],
      time: fileMatch[3],
      name: fileMatch[4],
    };
  };

  /**
   * Parse summary information from list output
   */
  private static parseListSummary = (lines: string[]): { totalFiles: number, totalLinks: number } => {
    const filesLine = lines.find(line => line.trim().match(/^\d+\s+files?,\s+for\s+\d+/));
    const linksLine = lines.find(line => line.trim().match(/^\d+\s+links?/));

    const filesMatch = filesLine?.trim().match(/^(\d+)\s+files?/);
    const linksMatch = linksLine?.trim().match(/^(\d+)\s+links?/);

    return {
      totalFiles: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      totalLinks: linksMatch ? parseInt(linksMatch[1], 10) : 0,
    };
  };

  /**
   * Parse list output
   * Format: "       76849 2025/12/01 07:54 filename.xlsx"
   */
  static parseListOutput(output: string): { files: SnapRaidFileInfo[], totalFiles: number, totalSize: number, totalLinks: number } {
    const lines = output.split('\n');
    const skipPrefixes = ['Loading', 'Listing', 'files, for', 'links'];
    
    const files = lines
      .filter(line => !this.shouldSkipLine(line, skipPrefixes))
      .map(line => this.parseFileListLine(line))
      .filter((file): file is SnapRaidFileInfo => file !== null);

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const { totalFiles, totalLinks } = this.parseListSummary(lines);

    return { files, totalFiles, totalSize, totalLinks };
  }

  /**
   * Parse missing file error from check output
   */
  private static parseMissingFile = (line: string, nextLine: string | undefined): CheckFileInfo | null => {
    const missingMatch = line.trim().match(/^Missing file '(.+)'\.$/);
    if (!missingMatch) return null;

    const filePath = missingMatch[1];
    const errorType = nextLine?.trim().startsWith('recoverable ') || nextLine?.trim().startsWith('unrecoverable ')
      ? nextLine.trim().split(/\s+/)[0]
      : 'Missing file';

    return {
      status: 'ERROR',
      name: filePath,
      error: errorType,
    };
  };

  /**
   * Parse check error line
   */
  private static parseCheckError = (line: string): CheckFileInfo | null => {
    const trimmed = line.trim();
    
    if (trimmed.includes('rehash')) {
      return {
        status: 'REHASH',
        name: trimmed,
        error: 'Needs rehashing',
      };
    }

    if (trimmed.toLowerCase().includes('error') && !trimmed.includes('errors')) {
      return {
        status: 'ERROR',
        name: trimmed,
        error: 'Check error',
      };
    }

    return null;
  };

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
    const lines = output.split('\n');
    const skipPrefixes = ['Self test', 'Loading', 'Searching', 'Using', 'Initializing', 'Selecting', 'Checking', 'WARNING'];
    const seenFiles = new Set<string>();

    const { files } = lines.reduce((acc, line, index) => {
      const trimmed = line.trim();
      
      // Skip lines
      if (!trimmed || skipPrefixes.some(prefix => trimmed.startsWith(prefix)) || trimmed.includes('% completed')) {
        return acc;
      }

      // Skip summary/error count lines
      if (trimmed.match(/^(\d+\s+(errors?|unrecoverable errors))$/)) {
        return acc;
      }

      // Parse missing file
      const missingFile = this.parseMissingFile(line, lines[index + 1]);
      if (missingFile && !seenFiles.has(missingFile.name)) {
        seenFiles.add(missingFile.name);
        return { 
          files: [...acc.files, missingFile], 
          processedIndices: new Set([...acc.processedIndices, index + 1])
        };
      }

      // Skip if this line was already processed as next line of missing file
      if (acc.processedIndices.has(index)) {
        return acc;
      }

      // Parse other errors
      const errorFile = this.parseCheckError(line);
      if (errorFile) {
        return { ...acc, files: [...acc.files, errorFile] };
      }

      return acc;
    }, { files: [] as CheckFileInfo[], processedIndices: new Set<number>() });

    // Parse error count from summary
    const errorLine = lines.find(line => line.trim().match(/^\d+\s+errors?$/));
    const errorMatch = errorLine?.trim().match(/^(\d+)\s+errors?$/);
    const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

    const rehashCount = files.filter(f => f.status === 'REHASH').length;
    const totalFiles = files.length;
    const okCount = Math.max(0, totalFiles - errorCount - rehashCount);

    return { files, totalFiles, errorCount, rehashCount, okCount };
  }

  /**
   * Parse diff status type
   */
  private static parseDiffStatus = (statusStr: string): DiffFileInfo['status'] => {
    const statusMap: Record<string, DiffFileInfo['status']> = {
      'add': 'added',
      'rem': 'removed',
      'remove': 'removed',
      'upd': 'updated',
      'update': 'updated',
      'updated': 'updated',
      'move': 'moved',
      'moved': 'moved',
      'copy': 'copied',
      'copied': 'copied',
      'rest': 'restored',
      'restore': 'restored',
    };
    return statusMap[statusStr] || 'equal';
  };

  /**
   * Parse diff summary line
   */
  private static parseDiffSummaryLine = (line: string): { type: string, count: number } | null => {
    const match = line.trim().match(/^\s*(\d+)\s+(equal|added|removed|updated|moved|copied|restored)/);
    return match ? { type: match[2], count: parseInt(match[1], 10) } : null;
  };

  /**
   * Parse individual diff file entry
   */
  private static parseDiffFileLine = (line: string): DiffFileInfo | null => {
    const fileMatch = line.trim().match(/^(add|rem|remove|upd|update|updated|move|moved|copy|copied|rest|restore)\s+(.+)$/);
    if (!fileMatch) return null;

    return {
      status: this.parseDiffStatus(fileMatch[1]),
      name: fileMatch[2],
    };
  };

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
    const lines = output.split('\n');
    const skipPrefixes = ['Self test', 'Loading', 'Comparing', 'Scanning', 'Using', 'Saving'];

    const { summary, files } = lines.reduce((acc, line) => {
      const trimmed = line.trim();
      
      // Skip lines
      if (!trimmed || skipPrefixes.some(prefix => trimmed.startsWith(prefix)) || trimmed.includes('% completed')) {
        return acc;
      }

      // Parse summary lines
      const summaryLine = this.parseDiffSummaryLine(line);
      if (summaryLine) {
        return { ...acc, summary: { ...acc.summary, [summaryLine.type]: summaryLine.count } };
      }

      // Parse file entries
      const fileLine = this.parseDiffFileLine(line);
      if (fileLine) {
        return { ...acc, files: [...acc.files, fileLine] };
      }

      return acc;
    }, { summary: {} as Record<string, number>, files: [] as DiffFileInfo[] });

    const equalFiles = summary.equal || 0;
    const newFiles = summary.added || 0;
    const deletedFiles = summary.removed || 0;
    const modifiedFiles = summary.updated || 0;
    const movedFiles = summary.moved || 0;
    const copiedFiles = summary.copied || 0;
    const restoredFiles = summary.restored || 0;
    const totalFiles = equalFiles + newFiles + modifiedFiles + deletedFiles + movedFiles + copiedFiles + restoredFiles;

    return { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles };
  }

  /**
   * Execute snapraid command with given args
   */
  private executeSnapraidCommand = async (args: string[]): Promise<{ stdout: string, stderr: string }> => {
    const cmd = new Deno.Command("snapraid", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, stderr } = await cmd.output();
    const decoder = new TextDecoder();
    
    return {
      stdout: decoder.decode(stdout),
      stderr: decoder.decode(stderr),
    };
  };

  /**
   * Log stderr if present
   */
  private logStderr = (commandName: string, stderr: string): void => {
    if (stderr) {
      console.log(`${commandName} command stderr:`, stderr);
    }
  };

  /**
   * Run devices command
   */
  async runDevices(configPath: string): Promise<DevicesReport> {
    const { stdout, stderr } = await this.executeSnapraidCommand(["devices", "-c", configPath]);
    this.logStderr("Devices", stderr);

    return {
      devices: SnapRaidRunner.parseDevicesOutput(stdout),
      timestamp: new Date().toISOString(),
      rawOutput: stdout,
    };
  }

  /**
   * Run list command
   */
  async runList(configPath: string): Promise<ListReport> {
    const { stdout, stderr } = await this.executeSnapraidCommand(["list", "-c", configPath]);
    this.logStderr("List", stderr);

    const { files, totalFiles, totalSize, totalLinks } = SnapRaidRunner.parseListOutput(stdout);

    return {
      files,
      totalFiles,
      totalSize,
      totalLinks,
      timestamp: new Date().toISOString(),
      rawOutput: stdout,
    };
  }

  /**
   * Run check command
   */
  async runCheck(configPath: string): Promise<CheckReport> {
    const { stdout, stderr } = await this.executeSnapraidCommand(["check", "-c", configPath]);
    this.logStderr("Check", stderr);

    const output = stdout + '\n' + stderr;
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
    const { stdout, stderr } = await this.executeSnapraidCommand(["diff", "-c", configPath]);
    this.logStderr("Diff", stderr);

    const output = stdout + '\n' + stderr;
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

  /**
   * Parse disk status from SMART output line
   */
  private static parseSmartStatus = (line: string): SmartDiskInfo['status'] | null => {
    const statuses: SmartDiskInfo['status'][] = ['FAIL', 'PREFAIL', 'LOGFAIL', 'LOGERR', 'SELFERR'];
    const found = statuses.find(status => line.includes(status));
    return found || null;
  };

  /**
   * Parse SMART attribute from line
   */
  private static parseSmartAttribute = (line: string, currentDisk: Partial<SmartDiskInfo>): void => {
    const tempMatch = line.match(/Temperature.*?(\d+)\s*°?C/i);
    if (tempMatch) {
      currentDisk.temperature = parseInt(tempMatch[1]);
      return;
    }

    const hoursMatch = line.match(/Power[_\s]On[_\s]Hours.*?(\d+)/i);
    if (hoursMatch) {
      currentDisk.powerOnHours = parseInt(hoursMatch[1]);
      return;
    }

    const probMatch = line.match(/probability.*?(\d+\.?\d*)%/i);
    if (probMatch) {
      currentDisk.failureProbability = parseFloat(probMatch[1]);
      return;
    }

    const modelMatch = line.match(/Device Model:\s*(.+)/i);
    if (modelMatch) {
      currentDisk.model = modelMatch[1].trim();
      return;
    }

    const serialMatch = line.match(/Serial Number:\s*(.+)/i);
    if (serialMatch) {
      currentDisk.serial = serialMatch[1].trim();
      return;
    }

    const sizeMatch = line.match(/User Capacity:\s*(.+)/i);
    if (sizeMatch) {
      currentDisk.size = sizeMatch[1].trim();
    }
  };

  /**
   * Parse SMART output
   */
  static parseSmartOutput(output: string): SmartDiskInfo[] {
    const lines = output.split('\n');
    const disks: SmartDiskInfo[] = [];
    
    const result = lines.reduce<{ currentDisk: Partial<SmartDiskInfo> | null }>((acc, line) => {
      const trimmed = line.trim();
      
      // Empty line - save current disk
      if (trimmed === '' && acc.currentDisk !== null) {
        disks.push(acc.currentDisk as SmartDiskInfo);
        return { currentDisk: null };
      }

      // Match disk header
      const diskMatch = trimmed.match(/^(\S+)\s+(.+)$/);
      if (diskMatch && !trimmed.includes(':') && acc.currentDisk === null) {
        return {
          currentDisk: {
            name: diskMatch[1],
            device: diskMatch[2],
            status: 'UNKNOWN' as const,
          },
        };
      }

      if (acc.currentDisk) {
        // Check status
        const status = this.parseSmartStatus(trimmed);
        if (status) {
          acc.currentDisk.status = status;
        } else if (acc.currentDisk.status === 'UNKNOWN' && trimmed.includes('/dev/')) {
          acc.currentDisk.status = 'OK';
        }

        // Parse attributes
        this.parseSmartAttribute(trimmed, acc.currentDisk);
      }

      return acc;
    }, { currentDisk: null });

    // Add last disk if exists
    if (result.currentDisk !== null) {
      disks.push(result.currentDisk as SmartDiskInfo);
    }

    return disks;
  }

  /**
   * Parse probe output
   */
  static parseProbeOutput(output: string): ProbeDiskInfo[] {
    return output.split('\n')
      .map(line => {
        const match = line.trim().match(/^(\S+)\s+(\S+)\s+(Standby|Active|Idle)/i);
        if (!match) return null;

        return {
          name: match[1],
          device: match[2],
          status: match[3] as ProbeDiskInfo['status'],
        };
      })
      .filter((disk): disk is ProbeDiskInfo => disk !== null);
  }
}
