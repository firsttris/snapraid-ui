import type { SnapRaidFileInfo } from "@shared/types.ts";
import { shouldSkipLine } from "./utils.ts";

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
