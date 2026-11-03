export interface FsUsage {
  mount: string;
  totalBytes: number;
  freeBytes: number;
}

/**
 * Parse the output of `df -B1 --output=size,avail,target <path>`
 */
export const parseDfOutput = (output: string): FsUsage | null => {
  const match = output.trim().split("\n")[1]?.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  return { totalBytes: Number(match[1]), freeBytes: Number(match[2]), mount: match[3] };
};
