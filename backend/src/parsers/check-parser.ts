import type { CheckFileInfo } from "@shared/types.ts";

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
