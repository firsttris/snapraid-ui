import type { SnapRaidFileInfo } from "@shared/types.ts";
import { parseLogTags, collectKeyValues, toInt, unescapeTagValue } from "./structured-log.ts";

/**
 * Extra argument required so that `list` emits one `file:` tag per file
 */
export const LIST_ARGS = ["--gui-verbose"];

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Format a unix timestamp in local time like the `list` text output ("2025/12/01", "07:54")
 */
const formatMtime = (mtimeSec: number): { date: string, time: string } => {
  const d = new Date(mtimeSec * 1000);
  return {
    date: `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

/**
 * Parse SnapRAID structured log output of `list --gui-verbose`
 * Format: file:<disk>:<path>:<size>:<mtime_sec>:<mtime_nsec>:<inode>
 */
export const parseListOutput = (output: string): { files: SnapRaidFileInfo[], totalFiles: number, totalSize: number, totalLinks: number } => {
  const tags = parseLogTags(output);
  const summary = collectKeyValues(tags, 'summary');

  const files = tags
    .filter(tag => tag.name === 'file' && tag.values.length >= 4)
    .map(({ values: [disk, path, size, mtimeSec] }) => ({
      disk,
      name: unescapeTagValue(path),
      size: toInt(size),
      ...formatMtime(toInt(mtimeSec)),
    }));

  return {
    files,
    totalFiles: toInt(summary.get('file_count'), files.length),
    totalSize: toInt(summary.get('file_size'), files.reduce((sum, file) => sum + file.size, 0)),
    totalLinks: toInt(summary.get('link_count')),
  };
};
