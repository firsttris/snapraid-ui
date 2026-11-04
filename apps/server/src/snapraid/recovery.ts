// Bring files back from parity as they were at the last sync: deleted ones, and changed ones
// (encrypted by ransomware, overwritten by mistake). `snapraid fix -d <disk> -f /<path>` does
// both, until the next sync records the new state.
import type { RestoreFile, SnapRaidCommand } from "@shared/types.ts";
import { isSuccessful } from "./run-report.ts";
import type { JobOutcome } from "./engine/engine.ts";

// More filters make the command line long and gain little, "all missing" (-m) covers the rest
export const MAX_RESTORE_FILES = 1000;

/**
 * SnapRAID filter that matches exactly this path, from the root of the disk. Its patterns know
 * `*`, `?` and `[...]` but no backslash escape, so those characters become one-letter classes.
 */
export const exactFilter = (path: string): string =>
  "/" + path.replace(/^\/+/, "").replace(/[*?[]/g, (char) => `[${char}]`);

/**
 * One fix per disk: a filter applies to every disk the run covers, a file of the same path on
 * another disk that was not picked must not be reverted
 */
export const restoreRuns = (files: RestoreFile[]): string[][] =>
  [...Map.groupBy(files, (file) => file.disk)].map(([disk, group]) => [
    "-d",
    disk,
    ...[...new Set(group.map((file) => file.path))].flatMap((path) => ["-f", exactFilter(path)]),
  ]);

/**
 * Runs the fixes one after the other; stops at a failed one or when another job started in between
 */
export const restoreFiles = async (
  files: RestoreFile[],
  run: (command: SnapRaidCommand, args: string[]) => Promise<JobOutcome | null>,
  isBusy: () => boolean,
): Promise<number> => {
  let done = 0;
  for (const args of restoreRuns(files)) {
    if (done > 0 && isBusy()) break;
    const outcome = await run("fix", args);
    if (!outcome || !isSuccessful(outcome.report.result)) break;
    done++;
  }
  return done;
};
