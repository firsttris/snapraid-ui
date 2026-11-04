// SnapRAID stops a run when it looks like data loss and names the switch that runs it anyway
export type ForceOption = "zero" | "empty" | "uuid";

export const FORCE_FLAGS: Record<ForceOption, string> = {
  zero: "--force-zero",   // Files that suddenly have zero size, e.g. truncated by a crash
  empty: "--force-empty", // All files of a disk missing, e.g. the disk is not mounted
  uuid: "--force-uuid",   // Too many disks changed their UUID, replaced or mixed-up mount points
};

/**
 * The switch SnapRAID suggests in its fatal message, like "use 'snapraid --force-empty sync'"
 */
export const detectForceOption = (output: string): ForceOption | undefined =>
  output.match(/'snapraid --force-(zero|empty|uuid) \w+'/)?.[1] as ForceOption | undefined;
