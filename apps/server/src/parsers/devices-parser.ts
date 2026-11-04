import type { DeviceInfo } from "@shared/types.ts";
import { shouldSkipLine } from "./utils.ts";

/**
 * Parse devices output
 * Format: "259:0   /dev/nvme0n1    259:2   /dev/nvme0n1p2  test1"
 */
export const parseDevicesOutput = (output: string): DeviceInfo[] => {
  const skipPrefixes = ['Loading', 'Listing'];
  
  return output.split('\n')
    .filter(line => !shouldSkipLine(line, skipPrefixes))
    .map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      
      return {
        majorMinor: parts[0],
        device: parts[1],
        partMajorMinor: parts[2],
        partition: parts[3],
        diskName: parts.slice(4).join(' '),
      };
    })
    .filter((device): device is DeviceInfo => device !== null);
};
