// Cleaning up duplicates: SnapRAID's `dup` lists files with the same content, from the hashes
// of the last sync. A copy is only deleted when it and the copy that stays are both exactly as
// at that sync (not in the diff) and have the size dup reported, so their content is still the
// same. Until the next sync, parity still holds every deleted copy and Recover files brings it back.
import { join, normalize, SEPARATOR } from "@std/path";
import type { DiffReport, DuplicateDeletion, DuplicateSkip, DupReport } from "@shared/types.ts";

// One request cleans up this many copies at most
export const MAX_DUPLICATE_DELETIONS = 5000;

/**
 * Paths the diff reports as anything but unchanged, both sides of a move or copy. Paths only,
 * without the disk: a path that changed anywhere is left alone.
 */
export const changedPaths = (diff: DiffReport): Set<string> =>
  new Set(
    diff.files
      .filter((file) => file.status !== "equal")
      .flatMap((file) => (file.status === "moved" || file.status === "copied" ? file.name.split(" -> ") : [file.name]))
      .map((path) => path.replace(/^\/+/, "")),
  );

/**
 * A path on a data disk; null when it would leave the disk
 */
export const insideDisk = (root: string, path: string): string | null => {
  const base = normalize(root).replace(/[\\/]+$/, "");
  const full = normalize(join(base, path));
  return full.startsWith(base + SEPARATOR) ? full : null;
};

const fileSize = async (path: string): Promise<number | null> => {
  try {
    const info = await Deno.lstat(path);
    return info.isFile ? info.size : null;
  } catch {
    return null;
  }
};

/**
 * Mark copies that are no longer on their disk: dup reads the content file, which lists a
 * deleted copy until the next sync
 */
export const markGone = async (report: DupReport, dataDisks: Record<string, string>): Promise<DupReport> => {
  const checked = new Map<string, Promise<boolean>>();
  const gone = (disk: string, path: string): Promise<boolean> => {
    const root = dataDisks[disk];
    const full = root ? insideDisk(root, path) : null;
    if (!full) return Promise.resolve(false); // Can't tell, it stays
    if (!checked.has(full)) checked.set(full, fileSize(full).then((size) => size === null));
    return checked.get(full) as Promise<boolean>;
  };
  const duplicates = await Promise.all(report.duplicates.map(async (file) => {
    const [copyGone, originalGone] = await Promise.all([
      gone(file.disk, file.name),
      gone(file.originalDisk, file.originalName),
    ]);
    return { ...file, ...(copyGone ? { gone: true } : {}), ...(originalGone ? { originalGone: true } : {}) };
  }));
  return { ...report, duplicates };
};

export interface DeleteOptions {
  dataDisks: Record<string, string>; // Name -> mount path
  changed: Set<string>; // From changedPaths
  remove?: (path: string) => Promise<void>;
}

/**
 * Delete the copies; each one that is not safe to delete is skipped with the reason
 */
export const deleteDuplicates = async (
  files: DuplicateDeletion[],
  { dataDisks, changed, remove = (path) => Deno.remove(path) }: DeleteOptions,
): Promise<{ deleted: DuplicateDeletion[]; skipped: DuplicateSkip[] }> => {
  const deleted: DuplicateDeletion[] = [];
  const skipped: DuplicateSkip[] = [];
  const key = (disk: string, path: string) => `${disk}\u0000${path.replace(/^\/+/, "")}`;
  const targets = new Set(files.map((file) => key(file.disk, file.path)));

  for (const file of files) {
    const skip = (reason: DuplicateSkip["reason"], error?: string) =>
      skipped.push({ disk: file.disk, path: file.path, reason, ...(error ? { error } : {}) });

    const root = dataDisks[file.disk];
    const keepRoot = dataDisks[file.keepDisk];
    if (!root || !keepRoot) {
      skip("unknown_disk");
      continue;
    }
    const target = insideDisk(root, file.path);
    const keep = insideDisk(keepRoot, file.keepPath);
    if (!target || !keep || target === keep) {
      skip("outside_disk");
      continue;
    }
    // The copy that stays must not go in the same run
    if (targets.has(key(file.keepDisk, file.keepPath))) {
      skip("kept_copy_deleted");
      continue;
    }
    if (changed.has(file.path.replace(/^\/+/, "")) || changed.has(file.keepPath.replace(/^\/+/, ""))) {
      skip("changed_since_sync");
      continue;
    }
    const [targetSize, keepSize] = await Promise.all([fileSize(target), fileSize(keep)]);
    if (targetSize === null || keepSize === null) {
      skip("missing");
      continue;
    }
    if (targetSize !== file.size || keepSize !== file.size) {
      skip("size_differs");
      continue;
    }
    try {
      await remove(target);
      deleted.push(file);
    } catch (error) {
      skip("failed", error instanceof Error ? error.message : String(error));
    }
  }
  return { deleted, skipped };
};
