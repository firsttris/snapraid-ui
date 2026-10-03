import { existsSync } from "@std/fs";
import type { SnapRaidStatus, UsagePoint } from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";

const STATE_FILE = "usage-history.json";
// One point per day, two years show the growth of a slowly filling array
const MAX_POINTS = 730;

export type UsageHistoryState = Record<string, UsagePoint[]>;

/**
 * Adds today's usage of a config, a later status on the same day replaces it
 */
export const addUsagePoint = (
  configPath: string,
  status: SnapRaidStatus,
  previous: UsageHistoryState,
  now = new Date(),
): UsageHistoryState => {
  if (status.totalUsedGB === undefined || status.totalFreeGB === undefined || !status.disks?.length) return previous;
  const date = now.toISOString().slice(0, 10);
  const point: UsagePoint = {
    date,
    usedGB: status.totalUsedGB,
    freeGB: status.totalFreeGB,
    disks: Object.fromEntries(status.disks.map((disk) => [disk.name, { usedGB: disk.usedGB, freeGB: disk.freeGB }])),
  };
  const points = (previous[configPath] ?? []).filter((p) => p.date !== date);
  points.push(point);
  return { ...previous, [configPath]: points.slice(-MAX_POINTS) };
};

const loadState = async (): Promise<UsageHistoryState> => {
  const path = resolveFromBase(STATE_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {};
  }
};

/**
 * Remember the usage of a status read, never fails the read itself
 */
export const recordUsage = async (configPath: string, status: SnapRaidStatus): Promise<void> => {
  try {
    const previous = await loadState();
    const state = addUsagePoint(configPath, status, previous);
    if (state !== previous) await Deno.writeTextFile(resolveFromBase(STATE_FILE), JSON.stringify(state));
  } catch (error) {
    console.error("Failed to record the usage history:", error);
  }
};

export const getUsageHistory = async (configPath: string): Promise<UsagePoint[]> =>
  (await loadState())[configPath] ?? [];
