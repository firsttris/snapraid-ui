import type { DiffFileInfo } from "@shared/types.ts";
import { type LogTag, parseLogTags, collectKeyValues, toInt, unescapeTagValue } from "./structured-log.ts";

/**
 * Parse a `scan:<kind>:...` tag into a diff entry.
 * `scan:equal` is only emitted with `--gui-verbose` and is skipped.
 */
const parseScanTag = ({ values }: LogTag): DiffFileInfo | null => {
  const [kind, disk, path, ...rest] = values;
  const name = unescapeTagValue(path ?? '');

  switch (kind) {
    case 'add':
      return { status: 'added', disk, name };
    case 'remove':
      return { status: 'removed', disk, name };
    // scan:update:<disk>:<path>: <old size> <old mtime> -> <new size> <new mtime>
    case 'update':
      return { status: 'updated', disk, name };
    case 'restore':
      return { status: 'restored', disk, name };
    // scan:move:<disk>:<old_path>:<new_path>
    case 'move':
      return { status: 'moved', disk, name: `${name} -> ${unescapeTagValue(rest[0] ?? '')}` };
    // scan:copy|relocate:<source_disk>:<source_path>:<disk>:<path>
    // (the order is source first, as in the `copy <source> -> <path>` text output)
    case 'copy':
    case 'relocate':
      return {
        status: kind === 'copy' ? 'copied' : 'moved',
        disk: rest[0],
        name: `${name} -> ${unescapeTagValue(rest[1] ?? '')}`,
      };
    default:
      return null;
  }
};

/**
 * Parse SnapRAID structured log output of `diff`
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
  const tags = parseLogTags(output);
  const summary = collectKeyValues(tags, 'summary');

  const files = tags
    .filter(tag => tag.name === 'scan')
    .map(parseScanTag)
    .filter((file): file is DiffFileInfo => file !== null);

  const equalFiles = toInt(summary.get('equal'));
  const newFiles = toInt(summary.get('added'));
  const deletedFiles = toInt(summary.get('removed'));
  const modifiedFiles = toInt(summary.get('updated'));
  const movedFiles = toInt(summary.get('moved')) + toInt(summary.get('relocated'));
  const copiedFiles = toInt(summary.get('copied'));
  const restoredFiles = toInt(summary.get('restored'));
  const totalFiles = equalFiles + newFiles + modifiedFiles + deletedFiles + movedFiles + copiedFiles + restoredFiles;

  return { files, totalFiles, equalFiles, newFiles, modifiedFiles, deletedFiles, movedFiles, copiedFiles, restoredFiles };
};
