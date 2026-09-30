import { isAbsolute, join, relative, resolve } from "@std/path";

export const BASE_PATH = Deno.env.get("SNAPRAID_BASE_PATH") || join(Deno.cwd(), "..", "snapraid");

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
export const SNAPRAID_BIN = Deno.env.get("SNAPRAID_BIN") || "snapraid";

// Extra args prepended to every invocation, e.g. "--test-skip-device" for sandboxes on a single device
export const SNAPRAID_EXTRA_ARGS = (Deno.env.get("SNAPRAID_EXTRA_ARGS") ?? "").split(/\s+/).filter(Boolean);

export const snapraidCommand = (args: string[]): Deno.Command =>
  new Deno.Command(SNAPRAID_BIN, {
    args: [...SNAPRAID_EXTRA_ARGS, ...args],
    stdout: "piped",
    stderr: "piped",
  });
