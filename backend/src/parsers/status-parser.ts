import type { SnapRaidStatus, DiskStatusInfo, ScrubHistoryPoint } from "@shared/types.ts";
import { type LogTag, parseLogTags, collectKeyValues, toInt } from "./structured-log.ts";

const toGB = (bytes: string | undefined): number =>
  Math.max(0, Math.round(parseFloat(bytes ?? '0') / 1e9 * 10) / 10) || 0;

/**
 * Block counters of the array from the `content_info:<kind>:<count>` tags
 */
const parseBlockCounters = (contentInfo: Map<string, string>) => ({
  total: toInt(contentInfo.get('block')),
  unscrubbed: toInt(contentInfo.get('block_unscrubbed')),
  unsynced: toInt(contentInfo.get('block_unsynced')),
  bad: toInt(contentInfo.get('block_bad')),
});

/**
 * Parse scrub percentage (share of blocks already scrubbed)
 */
const parseScrubPercentage = (total: number, unscrubbed: number): number | undefined =>
  total > 0 ? Math.floor((1 - unscrubbed / total) * 100) : undefined;

/**
 * Parse scrub age details
 */
const parseScrubAge = (summary: Map<string, string>): Partial<Pick<SnapRaidStatus, 'oldestScrubDays' | 'medianScrubDays' | 'newestScrubDays'>> => {
  const days = (key: string) => summary.has(key) ? toInt(summary.get(key)) : undefined;
  return {
    oldestScrubDays: days('scrub_oldest_days'),
    medianScrubDays: days('scrub_median_days'),
    newestScrubDays: days('scrub_newest_days'),
  };
};

/**
 * Parse per disk information from `summary:disk_<prop>:<disk>:<value>` tags
 */
const parseDisks = (tags: LogTag[]): DiskStatusInfo[] => {
  const diskMap = new Map<string, Record<string, string>>();

  tags
    .filter(tag => tag.name === 'summary' && tag.values[0]?.startsWith('disk_') && tag.values.length >= 3)
    .forEach(({ values: [key, diskName, value] }) => {
      const disk = diskMap.get(diskName) ?? {};
      disk[key.slice('disk_'.length)] = value;
      diskMap.set(diskName, disk);
    });

  return Array.from(diskMap.entries()).map(([name, disk]) => ({
    name,
    files: toInt(disk.file_count),
    fragmentedFiles: toInt(disk.fragmented_file_count),
    excessFragments: toInt(disk.excess_fragment_count),
    wastedGB: toGB(disk.space_wasted),
    usedGB: toGB(disk.used),
    freeGB: toGB(disk.free),
    usePercent: toInt(disk.use_percent),
  }));
};

/**
 * Parse array totals
 */
const parseTotals = (summary: Map<string, string>): Partial<SnapRaidStatus> => {
  if (!summary.has('file_count')) return {};

  return {
    totalFiles: toInt(summary.get('file_count')),
    fragmentedFiles: toInt(summary.get('fragmented_file_count')),
    wastedGB: toGB(summary.get('total_wasted')),
    totalUsedGB: toGB(summary.get('total_used')),
    totalFreeGB: toGB(summary.get('total_free')),
  };
};

/**
 * Parse diff statistics (`summary:added:<n>` ...), only present for diff/sync
 */
const parseDiffStats = (summary: Map<string, string>): Partial<SnapRaidStatus> => {
  if (!summary.has('added')) return {};

  return {
    equalFiles: toInt(summary.get('equal')),
    newFiles: toInt(summary.get('added')),
    deletedFiles: toInt(summary.get('removed')),
    modifiedFiles: toInt(summary.get('updated')),
    movedFiles: toInt(summary.get('moved')) + toInt(summary.get('relocated')),
    copiedFiles: toInt(summary.get('copied')),
    restoredFiles: toInt(summary.get('restored')),
  };
};

/**
 * Parse scrub history from `scrub_graph_bar:<index>:<days_ago>:<scrubbed>:<new>` (block counts).
 * Percentages are relative to the total block count, like the graph in the text report.
 */
const parseScrubHistory = (tags: LogTag[], totalBlocks: number): ScrubHistoryPoint[] => {
  if (totalBlocks === 0) return [];
  const historyMap = new Map<number, number>();

  tags
    .filter(tag => tag.name === 'scrub_graph_bar')
    .forEach(({ values: [, daysAgo, scrubbed, fresh] }) => {
      const percentage = (toInt(scrubbed) + toInt(fresh)) / totalBlocks * 100;
      historyMap.set(toInt(daysAgo), (historyMap.get(toInt(daysAgo)) ?? 0) + percentage);
    });

  return Array.from(historyMap.entries()).map(([daysAgo, percentage]) => ({
    daysAgo,
    percentage: Math.round(percentage),
  }));
};

/**
 * Parse SnapRAID structured log output of `status` (and `diff`)
 * @param output structured log (`--log ">&2"` output or log file content)
 * @param rawOutput human readable output to attach, defaults to `output`
 */
export const parseStatusOutput = (output: string, rawOutput: string = output): SnapRaidStatus => {
  const tags = parseLogTags(output);
  const summary = collectKeyValues(tags, 'summary');
  const contentInfo = collectKeyValues(tags, 'content_info');
  const exit = summary.get('exit');

  const blocks = parseBlockCounters(contentInfo);
  const fatal = tags.some(tag => tag.name === 'msg' && tag.values[0]?.startsWith('fatal'));
  const hasErrors = fatal || blocks.bad > 0 || exit === 'bad';
  const syncInProgress = blocks.unsynced > 0 || exit === 'unsynced';
  const diffStats = parseDiffStats(summary);
  const parityUpToDate = diffStats.newFiles !== undefined
    ? exit === 'equal'
    : !syncInProgress && !hasErrors;
  const totals = parseTotals(summary);

  return {
    hasErrors,
    badBlocks: blocks.bad,
    parityUpToDate,
    newFiles: 0,
    modifiedFiles: 0,
    deletedFiles: 0,
    disks: parseDisks(tags),
    scrubHistory: parseScrubHistory(tags, blocks.total),
    rawOutput,
    syncInProgress,
    scrubPercentage: parseScrubPercentage(blocks.total, blocks.unscrubbed),
    ...parseScrubAge(summary),
    ...totals,
    zeroSubsecondFiles: toInt(summary.get('zerosubsecond_file_count')),
    ...diffStats,
    freeSpaceGB: totals.totalFreeGB,
  };
};
