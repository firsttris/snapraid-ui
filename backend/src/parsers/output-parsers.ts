import type { 
  DeviceInfo, 
  SnapRaidFileInfo, 
  CheckFileInfo, 
  DiffFileInfo, 
  SmartDiskInfo, 
  ProbeDiskInfo 
} from "@shared/types.ts";

/**
 * Check if line should be skipped
 */
const shouldSkipLine = (line: string, prefixes: string[]): boolean => {
  const trimmed = line.trim();
  return !trimmed || prefixes.some(prefix => trimmed.startsWith(prefix));
};

/**
 * Parse devices output
 * Format: "259:0   /dev/nvme0n1    259:2   /dev/nvme0n1p2  test1"
 */
export const parseDevicesOutput = (output: string): DeviceInfo[] => {
  const skipPrefixes = ['Loading', 'Listing'];
  
  return output.split('\n')
    .filter(line => !shouldSkipLine(line, skipPrefixes))
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
};

/**
 * Parse file line from list output
 */
const parseFileListLine = (line: string): SnapRaidFileInfo | null => {
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
const parseListSummary = (lines: string[]): { totalFiles: number, totalLinks: number } => {
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
export const parseListOutput = (output: string): { files: SnapRaidFileInfo[], totalFiles: number, totalSize: number, totalLinks: number } => {
  const lines = output.split('\n');
  const skipPrefixes = ['Loading', 'Listing', 'files, for', 'links'];
  
  const files = lines
    .filter(line => !shouldSkipLine(line, skipPrefixes))
    .map(line => parseFileListLine(line))
    .filter((file): file is SnapRaidFileInfo => file !== null);

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const { totalFiles, totalLinks } = parseListSummary(lines);

  return { files, totalFiles, totalSize, totalLinks };
};

/**
 * Parse missing file error from check output
 */
const parseMissingFile = (line: string, nextLine: string | undefined): CheckFileInfo | null => {
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
const parseCheckError = (line: string): CheckFileInfo | null => {
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
export const parseCheckOutput = (output: string): { files: CheckFileInfo[], totalFiles: number, errorCount: number, rehashCount: number, okCount: number } => {
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
    const missingFile = parseMissingFile(line, lines[index + 1]);
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
    const errorFile = parseCheckError(line);
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
};

/**
 * Parse diff status type
 */
const parseDiffStatus = (statusStr: string): DiffFileInfo['status'] => {
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
const parseDiffSummaryLine = (line: string): { type: string, count: number } | null => {
  const match = line.trim().match(/^\s*(\d+)\s+(equal|added|removed|updated|moved|copied|restored)/);
  return match ? { type: match[2], count: parseInt(match[1], 10) } : null;
};

/**
 * Parse individual diff file entry
 */
const parseDiffFileLine = (line: string): DiffFileInfo | null => {
  const fileMatch = line.trim().match(/^(add|rem|remove|upd|update|updated|move|moved|copy|copied|rest|restore)\s+(.+)$/);
  if (!fileMatch) return null;

  return {
    status: parseDiffStatus(fileMatch[1]),
    name: fileMatch[2],
  };
};

/**
 * Parse diff output
 */
export const parseDiffOutput = (output: string): { 
  files: DiffFileInfo[], 
  totalFiles: number, 
  equalFiles: number,
  newFiles: number, 
  modifiedFiles: number, 
  deletedFiles: number,
  movedFiles: number,
  copiedFiles: number,
  restoredFiles: number
} => {
  const lines = output.split('\n');
  const skipPrefixes = ['Self test', 'Loading', 'Comparing', 'Scanning', 'Using', 'Saving'];

  const { summary, files } = lines.reduce((acc, line) => {
    const trimmed = line.trim();
    
    // Skip lines
    if (!trimmed || skipPrefixes.some(prefix => trimmed.startsWith(prefix)) || trimmed.includes('% completed')) {
      return acc;
    }

    // Parse summary lines
    const summaryLine = parseDiffSummaryLine(line);
    if (summaryLine) {
      return { ...acc, summary: { ...acc.summary, [summaryLine.type]: summaryLine.count } };
    }

    // Parse file entries
    const fileLine = parseDiffFileLine(line);
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
};

/**
 * Parse disk status from SMART output line
 */
const parseSmartStatus = (line: string): SmartDiskInfo['status'] | null => {
  const statuses: SmartDiskInfo['status'][] = ['FAIL', 'PREFAIL', 'LOGFAIL', 'LOGERR', 'SELFERR'];
  const found = statuses.find(status => line.includes(status));
  return found || null;
};

/**
 * Parse SMART attribute from line
 */
const parseSmartAttribute = (line: string, currentDisk: Partial<SmartDiskInfo>): void => {
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
export const parseSmartOutput = (output: string): SmartDiskInfo[] => {
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
      const status = parseSmartStatus(trimmed);
      if (status) {
        acc.currentDisk.status = status;
      } else if (acc.currentDisk.status === 'UNKNOWN' && trimmed.includes('/dev/')) {
        acc.currentDisk.status = 'OK';
      }

      // Parse attributes
      parseSmartAttribute(trimmed, acc.currentDisk);
    }

    return acc;
  }, { currentDisk: null });

  // Add last disk if exists
  if (result.currentDisk !== null) {
    disks.push(result.currentDisk as SmartDiskInfo);
  }

  return disks;
};

/**
 * Parse probe output
 */
export const parseProbeOutput = (output: string): ProbeDiskInfo[] => {
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
};

