import type { ProbeDiskInfo } from "@shared/types.ts";
import { parseLogTags, toInt } from "./structured-log.ts";

const POWER_STATES: Record<number, ProbeDiskInfo['status']> = {
  0: 'Standby',
  1: 'Active',
};

/**
 * Parse SnapRAID structured log output of `probe`
 * Format: probe:<device_file>:<disk_name>:<power> with power 0 = standby, 1 = active, -1 = unknown
 */
export const parseProbeOutput = (output: string): ProbeDiskInfo[] =>
  parseLogTags(output)
    .filter(tag => tag.name === 'probe' && tag.values.length >= 3)
    .map(({ values: [device, name, power] }) => ({
      name: name || '-',
      device: device || '-',
      status: POWER_STATES[toInt(power, -1)] ?? 'Unknown',
    }));
