import type { CheckFileInfo } from "@shared/types.ts";
import { parseLogTags, collectKeyValues, toInt, unescapeTagValue, restOf } from "./structured-log.ts";

/**
 * Per-block error tags: error[_io|_data]:<block>:<disk>:<file>:<msg>
 */
const FILE_ERROR_TAGS = new Set(['error', 'error_io', 'error_data']);

/**
 * Per-item error tags without block: <kind>_error[_io]:<disk>:<path>:...:<msg>
 */
const LINK_ERROR_TAGS = new Set(['hardlink_error', 'hardlink_error_io', 'symlink_error', 'symlink_error_io', 'dir_error', 'dir_error_io']);

/**
 * Parse SnapRAID structured log output of `check`
 * Errors are reported per block, so they are grouped per file with the first message.
 * The final state of each file comes from `status:<recoverable|unrecoverable|recovered|correct>:<disk>:<file>`.
 */
export const parseCheckOutput = (output: string): { files: CheckFileInfo[], totalFiles: number, errorCount: number, rehashCount: number, okCount: number } => {
  const tags = parseLogTags(output);
  const summary = collectKeyValues(tags, 'summary');
  const contentInfo = collectKeyValues(tags, 'content_info');
  const entries = new Map<string, { disk: string, name: string, message?: string, state?: string }>();

  const entry = (disk: string, name: string) => {
    const key = `${disk}:${name}`;
    const existing = entries.get(key) ?? { disk, name };
    entries.set(key, existing);
    return existing;
  };

  tags.forEach(({ name, values }) => {
    if (FILE_ERROR_TAGS.has(name)) {
      const e = entry(values[1], unescapeTagValue(values[2]));
      e.message ??= restOf(values, 3);
    } else if (LINK_ERROR_TAGS.has(name)) {
      const e = entry(values[0], unescapeTagValue(values[1]));
      e.message ??= values[values.length - 1]?.trim();
    } else if (name === 'parity_error' || name === 'parity_error_io' || name === 'parity_error_data') {
      // parity_error[_io|_data]:<block>:<level>:<msg>
      const e = entry(values[1], values[1]);
      e.message ??= restOf(values, 2);
    } else if (name === 'outofparity') {
      const e = entry(values[0], unescapeTagValue(values[1]));
      e.message ??= 'Out of parity';
    } else if (name === 'status') {
      entry(values[1], unescapeTagValue(values[2])).state = values[0];
    }
  });

  const files: CheckFileInfo[] = Array.from(entries.values()).map(({ disk, name, message, state }) => ({
    status: state === 'correct' || state === 'recovered' ? 'OK' : 'ERROR',
    disk,
    name,
    error: [state, message].filter(Boolean).join(': ') || undefined,
  }));

  const errorCount = toInt(summary.get('error_soft')) + toInt(summary.get('error_io')) + toInt(summary.get('error_data'));
  // check reports no per-file rehash state, only the blocks of the content file still waiting for a new hash
  const rehashCount = toInt(contentInfo.get('block_rehash'));
  const totalFiles = files.length;
  const okCount = files.filter(f => f.status === 'OK').length;

  return { files, totalFiles, errorCount, rehashCount, okCount };
};
