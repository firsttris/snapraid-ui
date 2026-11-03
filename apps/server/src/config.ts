import { isAbsolute, join, relative, resolve } from "node:path";

// Without the variable: snapraid/ in the repository's root, two levels up from apps/server/
export const BASE_PATH = process.env.SNAPRAID_BASE_PATH || join(process.cwd(), "..", "..", "snapraid");

/**
 * Resolve a path against BASE_PATH; absolute paths (e.g. /mnt/parity/snapraid.conf) are kept as is
 */
export const resolveFromBase = (path: string): string => resolve(BASE_PATH, path);

/**
 * Path to store for a file: relative to BASE_PATH when inside it, absolute otherwise
 */
export const toStoredPath = (path: string): string => {
  const absolute = resolveFromBase(path);
  const fromBase = relative(BASE_PATH, absolute);
  return fromBase && !fromBase.startsWith("..") && !isAbsolute(fromBase) ? fromBase : absolute;
};

// Binary to invoke, e.g. a locally built one for development
export const SNAPRAID_BIN = process.env.SNAPRAID_BIN || "snapraid";

// Extra args prepended to every invocation, e.g. "--test-skip-device" for sandboxes on a single device
export const SNAPRAID_EXTRA_ARGS = (process.env.SNAPRAID_EXTRA_ARGS ?? "").split(/\s+/).filter(Boolean);

// The command line of a SnapRAID invocation, for runCommand or Bun.spawn
export const snapraidCommand = (args: string[]): string[] => [SNAPRAID_BIN, ...SNAPRAID_EXTRA_ARGS, ...args];
