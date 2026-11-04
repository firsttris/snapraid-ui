// File system helpers where node:fs does not do what the backend needs
import { statSync } from "node:fs";
import { chmod, rmdir, unlink, writeFile } from "node:fs/promises";

/**
 * Whether a path exists: false only when it is missing; a path that is there but cannot be read
 * counts as existing, any other error is thrown (node's existsSync says false to all of them)
 */
export const existsSync = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return false;
    if (code === "EACCES" || code === "EPERM") return true;
    throw error;
  }
};

/**
 * Removes a file or an empty directory (node's rm takes no directory without `recursive`)
 */
export const remove = async (path: string): Promise<void> => {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "EISDIR") throw error;
    await rmdir(path);
  }
};

/**
 * The code of a failed system call, e.g. ENOENT for a missing file
 */
export const errorCode = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | null)?.code;

/**
 * The path is missing (ENOENT)
 */
export const isNotFound = (error: unknown): boolean => errorCode(error) === "ENOENT";

/**
 * The path is there already (EEXIST)
 */
export const isAlreadyExists = (error: unknown): boolean => errorCode(error) === "EEXIST";

/**
 * Writes a text file; with a mode the file gets exactly these permissions, also when it existed
 * (writeFile applies the mode, less the umask, to a new file only)
 */
export const writeTextFile = async (path: string, content: string, options: { mode?: number } = {}): Promise<void> => {
  await writeFile(path, content, options.mode === undefined ? {} : { mode: options.mode });
  if (options.mode !== undefined) await chmod(path, options.mode);
};
