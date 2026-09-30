import { dirname, join } from "@std/path";
import { isPendingRemoval, parseParityLine, REMOVAL_DIR } from "./config-parser.ts";

/**
 * Removing a data disk follows the SnapRAID FAQ:
 * 1. point its `data` line to an empty directory, 2. drop its `content` files,
 * 3. `snapraid sync -E`, 4. drop the `data` line once the sync succeeded.
 * The empty directory lives on the removed disk itself, so it does not share a device with another disk.
 */

export class DiskRemovalError extends Error {}

const DATA_LINE = /^data\s+(\S+)\s+(.+)$/;

const parseDataLine = (line: string): { name: string; path: string } | null => {
  const match = line.trim().match(DATA_LINE);
  return match ? { name: match[1], path: match[2].trim() } : null;
};

const trimSlash = (path: string): string => path.length > 1 ? path.replace(/\/+$/, "") : path;

/**
 * Steps 1 and 2: point the disk to its empty directory and drop its content files.
 * Also accepts a disk that is already pending, so a failed sync can be retried.
 */
export const prepareDataDiskRemoval = (
  config: string,
  diskName: string,
): { config: string; emptyDir: string } => {
  const lines = config.split("\n");
  const dataLines = lines.map(parseDataLine);
  const index = dataLines.findIndex(data => data?.name === diskName);
  if (index === -1) {
    throw new DiskRemovalError(`Data disk '${diskName}' not found`);
  }
  if (dataLines.filter(data => data !== null).length < 2) {
    throw new DiskRemovalError("The last data disk cannot be removed");
  }

  const currentPath = trimSlash(dataLines[index]!.path);
  const diskPath = isPendingRemoval(currentPath) ? dirname(currentPath) : currentPath;
  const emptyDir = join(diskPath, REMOVAL_DIR);

  const isOnDisk = (line: string): boolean => {
    const trimmed = line.trim();
    return trimmed.startsWith("content ") && trimmed.substring(8).trim().startsWith(`${diskPath}/`);
  };
  const remaining = lines.filter(line => line.trim().startsWith("content ") && !isOnDisk(line)).length;
  const levels = lines.filter(line => parseParityLine(line)).length;
  if (remaining < levels + 1) {
    throw new DiskRemovalError(
      `SnapRAID needs at least ${levels + 1} content files on other disks, only ${remaining} would remain`,
    );
  }

  const updated = lines
    .map((line, i) => (i === index ? `data ${diskName} ${emptyDir}` : line))
    .filter(line => !isOnDisk(line));
  return { config: updated.join("\n"), emptyDir };
};

/**
 * Step 4: drop the `data` line, but only while it still points to the removal directory
 */
export const finalizeDataDiskRemoval = (config: string, diskName: string): string =>
  config
    .split("\n")
    .filter(line => {
      const data = parseDataLine(line);
      return !(data?.name === diskName && isPendingRemoval(data.path));
    })
    .join("\n");

/**
 * Create the removal directory; SnapRAID would sync whatever it contains
 */
export const ensureEmptyDir = async (path: string): Promise<void> => {
  await Deno.mkdir(path, { recursive: true });
  for await (const _ of Deno.readDir(path)) {
    throw new DiskRemovalError(`${path} is not empty`);
  }
};
