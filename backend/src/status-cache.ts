// The last status SnapRAID reported per config, kept in memory for the metrics: a scrape
// must not run SnapRAID, its content files may sit on sleeping disks
import type { SnapRaidStatus } from "@shared/types.ts";

export interface CachedStatus {
  timestamp: string;
  status: SnapRaidStatus;
}

const statuses = new Map<string, CachedStatus>();

export const rememberStatus = (configPath: string, status: SnapRaidStatus, now = new Date()): void => {
  statuses.set(configPath, { timestamp: now.toISOString(), status });
};

export const lastStatus = (configPath: string): CachedStatus | undefined => statuses.get(configPath);
