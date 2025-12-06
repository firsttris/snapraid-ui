import type { DiffFileInfo } from "@shared/types.ts";

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
