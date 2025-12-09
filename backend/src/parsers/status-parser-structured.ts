import type { SnapRaidStatus, DiskStatusInfo, ScrubHistoryPoint } from "@shared/types.ts";

/**
 * Parse key:value pairs from structured output
 */
const parseKeyValue = (line: string): [string, string] | null => {
  const lastColonIndex = line.lastIndexOf(':');
  if (lastColonIndex === -1) return null;
  const key = line.slice(0, lastColonIndex).trim();
  const value = line.slice(lastColonIndex + 1).trim();
  return [key, value];
};

/**
 * Parse key:value pairs into a map
 */
const parseKeyValueMap = (lines: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  lines.forEach(line => {
    const kv = parseKeyValue(line);
    if (kv) {
      map.set(kv[0], kv[1]);
    }
  });
  return map;
};

/**
 * Check if output has errors using structured data
 */
const hasErrors = (keyValueMap: Map<string, string>): boolean => {
  const hasBad = keyValueMap.get('summary:has_bad');
  return hasBad ? hasBad !== '0:0:0' : false;
};

/**
 * Check if parity is up to date using structured data
 */
const isParityUpToDate = (keyValueMap: Map<string, string>, syncInProgress: boolean): boolean => {
  const hasUnsynced = keyValueMap.get('summary:has_unsynced');
  return (hasUnsynced === '0') && !syncInProgress;
};

/**
 * Parse scrub percentage from structured data
 */
const parseScrubPercentage = (keyValueMap: Map<string, string>): number | undefined => {
  const blockCount = keyValueMap.get('block_count');
  const hasUnscrubbed = keyValueMap.get('summary:has_unscrubbed');
  if (blockCount && hasUnscrubbed) {
    const total = parseInt(blockCount, 10);
    const unscrubbed = parseInt(hasUnscrubbed, 10);
    if (total > 0) {
      return Math.round((1 - unscrubbed / total) * 100);
    }
  }
  return undefined;
};

/**
 * Parse scrub age details from structured keys
 */
const parseScrubAge = (keyValueMap: Map<string, string>): Partial<Pick<SnapRaidStatus, 'oldestScrubDays' | 'medianScrubDays' | 'newestScrubDays'>> => {
  const oldest = keyValueMap.get('summary:scrub_oldest_days');
  const median = keyValueMap.get('summary:scrub_median_days');
  const newest = keyValueMap.get('summary:scrub_newest_days');

  return {
    oldestScrubDays: oldest ? parseInt(oldest, 10) : undefined,
    medianScrubDays: median ? parseInt(median, 10) : undefined,
    newestScrubDays: newest ? parseInt(newest, 10) : undefined,
  };
};

/**
 * Parse disk information from summary keys
 */
const parseDisksFromSummary = (keyValueMap: Map<string, string>): DiskStatusInfo[] => {
  const diskMap = new Map<string, Partial<DiskStatusInfo>>();

  keyValueMap.forEach((value, key) => {
    const parts = key.split(':');
    if (parts[0] === 'summary' && parts[1]?.startsWith('disk_')) {
      const diskName = parts[2];
      const prop = parts[1].replace('disk_', '');
      const disk = diskMap.get(diskName) || { name: diskName };

      switch (prop) {
        case 'file_count':
          disk.files = parseInt(value, 10) || 0;
          break;
        case 'fragmented_file_count':
          disk.fragmentedFiles = parseInt(value, 10) || 0;
          break;
        case 'excess_fragment_count':
          disk.excessFragments = parseInt(value, 10) || 0;
          break;
        case 'space_wasted':
          disk.wastedGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
        case 'used':
          disk.usedGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
        case 'free':
          disk.freeGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
        case 'use_percent':
          disk.usePercent = parseInt(value, 10) || 0;
          break;
      }
      diskMap.set(diskName, disk);
    }
  });

  return Array.from(diskMap.values()).map(disk => ({
    name: disk.name!,
    files: disk.files || 0,
    fragmentedFiles: disk.fragmentedFiles || 0,
    excessFragments: disk.excessFragments || 0,
    wastedGB: disk.wastedGB || 0,
    usedGB: disk.usedGB || 0,
    freeGB: disk.freeGB || 0,
    usePercent: disk.usePercent || 0,
  }));
};

/**
 * Parse totals from summary keys
 */
const parseTotalsFromSummary = (keyValueMap: Map<string, string>): Partial<SnapRaidStatus> => {
  const totals: Partial<SnapRaidStatus> = {};

  keyValueMap.forEach((value, key) => {
    const parts = key.split(':');
    if (parts[0] === 'summary') {
      const prop = parts[1];
      switch (prop) {
        case 'file_count':
          totals.totalFiles = parseInt(value, 10) || 0;
          break;
        case 'fragmented_file_count':
          totals.fragmentedFiles = parseInt(value, 10) || 0;
          break;
        case 'total_wasted':
          totals.wastedGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
        case 'total_used':
          totals.totalUsedGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
        case 'total_free':
          totals.totalFreeGB = Math.max(0, Math.round(parseFloat(value) / 1e9 * 10) / 10);
          break;
      }
    }
  });

  return totals;
};

/**
 * Parse scrub history from structured keys
 */
const parseScrubHistoryFromKeys = (lines: string[]): ScrubHistoryPoint[] => {
  const historyMap = new Map<number, number>();

  lines.forEach(line => {
    const kv = parseKeyValue(line);
    if (kv && kv[0].startsWith('scrub_history:')) {
      const parts = kv[0].split(':');
      if (parts.length >= 2) {
        const daysAgo = parseInt(parts[1], 10);
        const percentage = parseInt(kv[1], 10);
        if (!isNaN(daysAgo) && !isNaN(percentage)) {
          const current = historyMap.get(daysAgo) || 0;
          historyMap.set(daysAgo, current + percentage);
        }
      }
    }
  });

  return Array.from(historyMap.entries()).map(([daysAgo, percentage]) => ({
    daysAgo,
    percentage,
  }));
};

/**
 * Parse SnapRAID structured status output
 */
export const parseStatusOutput = (output: string): SnapRaidStatus => {
  const lines = output.split('\n');
  const keyValueMap = parseKeyValueMap(lines);
  const syncInProgress = keyValueMap.get('summary:has_unsynced') !== '0';

  const disks = parseDisksFromSummary(keyValueMap);
  const totals = parseTotalsFromSummary(keyValueMap);
  const scrubAge = parseScrubAge(keyValueMap);
  const scrubPercentage = parseScrubPercentage(keyValueMap);
  const scrubHistory = parseScrubHistoryFromKeys(lines);

  const status: SnapRaidStatus = {
    hasErrors: hasErrors(keyValueMap),
    parityUpToDate: isParityUpToDate(keyValueMap, syncInProgress),
    newFiles: 0,
    modifiedFiles: 0,
    deletedFiles: 0,
    disks,
    scrubHistory,
    rawOutput: output,
    syncInProgress,
    scrubPercentage,
    ...scrubAge,
    ...totals,
  };

  // Legacy fallback
  if (!status.freeSpaceGB && status.totalFreeGB) {
    status.freeSpaceGB = status.totalFreeGB;
  }

  return status;
};;