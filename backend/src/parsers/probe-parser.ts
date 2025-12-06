import type { ProbeDiskInfo } from "@shared/types.ts";

/**
 * Parse probe output
 */
export const parseProbeOutput = (output: string): ProbeDiskInfo[] => {
  return output.split('\n')
    .map(line => {
      const match = line.trim().match(/^(\S+)\s+(\S+)\s+(Standby|Active|Idle)/i);
      if (!match) return null;

      return {
        name: match[1],
        device: match[2],
        status: match[3] as ProbeDiskInfo['status'],
      };
    })
    .filter((disk): disk is ProbeDiskInfo => disk !== null);
};
