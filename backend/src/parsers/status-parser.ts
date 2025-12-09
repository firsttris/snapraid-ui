import type { SnapRaidStatus, DiskStatusInfo, ScrubHistoryPoint } from "@shared/types.ts";

/**
 * Check if output has errors
 */
const hasErrors = (output: string): boolean => {
  if (output.includes("No error detected")) return false;
  return output.toLowerCase().includes("error") || 
         output.toLowerCase().includes("warning") ||
         output.includes("bad blocks");
};

/**
 * Parse scrub percentage from output
 */
const parseScrubPercentage = (output: string): number | undefined => {
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
const parseScrubAge = (output: string): Partial<Pick<SnapRaidStatus, 'oldestScrubDays' | 'medianScrubDays' | 'newestScrubDays'>> => {
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
const parseDiskRow = (line: string): DiskStatusInfo | null => {
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
const parseTotalLine = (line: string): Partial<SnapRaidStatus> => {
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
const parseDiskTable = (lines: string[]): { disks: DiskStatusInfo[], totals: Partial<SnapRaidStatus> } => {
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
  if (line.trim().match(/^ *-{10,} *$/)) {
    const totalLine = lines[index + 1];
    const totals = totalLine ? parseTotalLine(totalLine) : {};
    return { ...acc, inTable: false, totals };
  }    // Parse disk rows
    if (acc.inTable && line.trim()) {
      const diskInfo = parseDiskRow(line);
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
const parseDiffStats = (lines: string[]): Partial<SnapRaidStatus> => {
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
const parseScrubHistory = (lines: string[], oldestScrubDays?: number, newestScrubDays?: number): ScrubHistoryPoint[] => {
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
  const minDays = newestScrubDays || 0;

  return chartLines.lines.flatMap(chartLine => {
    const percentMatch = chartLine.match(/^\s*(\d+)%\|/);
    if (!percentMatch) return [];

    const percentage = parseInt(percentMatch[1], 10);
    const pipeIndex = chartLine.indexOf('|');
    
    return [...chartLine].reduce((positions, char, index) => {
      if (char !== 'o') return positions;
      const relativePos = (index - pipeIndex - 1) / CHART_WIDTH;
      // Left side (pos=0) is oldest, right side (pos=1) is newest
      const daysAgo = Math.round(maxDays - (relativePos * (maxDays - minDays)));
      return [...positions, { daysAgo, percentage }];
    }, [] as ScrubHistoryPoint[]);
  });
};

/**
 * Check if parity is up to date
 */
const isParityUpToDate = (output: string, syncInProgress: boolean): boolean => 
  (output.includes("No error detected") && !syncInProgress) ||
  output.includes("Everything OK") ||
  output.includes("Nothing to do") ||
  output.includes("No differences") ||
  (output.includes("equal") && !output.match(/(\d+)\s+(added|removed|updated)/i));

/**
 * Parse SnapRAID status/diff output
 */
export const parseStatusOutput = (output: string): SnapRaidStatus => {
  const lines = output.split('\n');
  const syncInProgress = output.includes("sync is in progress") && !output.includes("No sync is in progress");
  
  const { disks, totals } = parseDiskTable(lines);
  const diffStats = parseDiffStats(lines);
  const scrubAge = parseScrubAge(output);
  const scrubPercentage = parseScrubPercentage(output);
  const scrubHistory = parseScrubHistory(lines, scrubAge.oldestScrubDays, scrubAge.newestScrubDays);

  const status: SnapRaidStatus = {
    hasErrors: hasErrors(output),
    parityUpToDate: isParityUpToDate(output, syncInProgress),
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
};
