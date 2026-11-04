import type { DuplicateFile } from "@shared/types.ts";
import { parseLogTags, toInt, unescapeTagValue } from "./structured-log.ts";

/**
 * Parse SnapRAID structured log output of `dup`
 * Tag: dup:<disk1>:<path1>:<disk2>:<path2>:<size>: dup
 * Paths are escaped, so splitting on `:` is safe.
 */
export const parseDupOutput = (output: string): { duplicates: DuplicateFile[]; totalSize: number } => {
  const duplicates = parseLogTags(output)
    .filter(tag => tag.name === "dup" && tag.values.length >= 5)
    .map(({ values: [disk, name, originalDisk, originalName, size] }) => ({
      disk,
      name: unescapeTagValue(name),
      originalDisk,
      originalName: unescapeTagValue(originalName),
      size: toInt(size),
    }));

  return {
    duplicates,
    totalSize: duplicates.reduce((sum, dup) => sum + dup.size, 0),
  };
};
