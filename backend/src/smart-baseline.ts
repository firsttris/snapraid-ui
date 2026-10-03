import { existsSync } from "@std/fs";
import type { SmartDiskInfo } from "@shared/types.ts";
import { CRC_ATTRIBUTE_ID } from "@shared/smart-health.ts";
import { resolveFromBase } from "./config.ts";

const STATE_FILE = "smart-baseline.json";

// A count that grew stays a warning this long, so a single check does not hide it again
export const CRC_GROWTH_WARN_DAYS = 30;

interface CrcEntry {
  count: number;
  since: string;            // When this count was first seen
  grownAt: string | null;   // When it last grew, null for the first count seen
}

export type CrcState = Record<string, CrcEntry>;

const diskKey = (configPath: string, disk: SmartDiskInfo) => disk.serial ?? `${configPath}|${disk.name}`;

const crcCount = (disk: SmartDiskInfo): number => {
  const raw = disk.attributes?.find((attribute) => attribute.id === CRC_ATTRIBUTE_ID)?.raw;
  const count = parseInt(raw ?? "", 10);
  return Number.isNaN(count) ? 0 : count;
};

/**
 * Transfer errors are a cable problem that stays in the counter forever, only a growing count is news.
 * Marks disks whose count stayed the same and returns the counts to remember.
 */
export const applyCrcBaseline = (
  configPath: string,
  disks: SmartDiskInfo[],
  previous: CrcState,
  now = new Date(),
): { disks: SmartDiskInfo[]; state: CrcState } => {
  const state = { ...previous };
  const result = disks.map((disk) => {
    // A sleeping disk reports no attributes, its count is unknown rather than zero
    if (disk.standby || !disk.attributes) return disk;
    const key = diskKey(configPath, disk);
    const count = crcCount(disk);
    if (count === 0) {
      delete state[key];
      return disk;
    }

    const entry = state[key];
    if (!entry || entry.count !== count) {
      // The first count seen is the baseline; a smaller one means a reset counter or another disk
      const grown = !!entry && count > entry.count;
      state[key] = { count, since: now.toISOString(), grownAt: grown ? now.toISOString() : null };
      if (grown) return disk;
    }

    const { since, grownAt } = state[key];
    const recentlyGrown = grownAt !== null &&
      now.getTime() - new Date(grownAt).getTime() < CRC_GROWTH_WARN_DAYS * 24 * 60 * 60 * 1000;
    return recentlyGrown ? disk : { ...disk, crcStableSince: since };
  });
  return { disks: result, state };
};

const loadState = async (): Promise<CrcState> => {
  const path = resolveFromBase(STATE_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {};
  }
};

/**
 * The disks with their transfer error history, remembered across SMART reads
 */
export const withCrcBaseline = async (configPath: string, disks: SmartDiskInfo[]): Promise<SmartDiskInfo[]> => {
  try {
    const previous = await loadState();
    const { disks: result, state } = applyCrcBaseline(configPath, disks, previous);
    if (JSON.stringify(state) !== JSON.stringify(previous)) {
      await Deno.writeTextFile(resolveFromBase(STATE_FILE), JSON.stringify(state, null, 2));
    }
    return result;
  } catch (error) {
    // Without the history every count is a warning, as before
    console.error("Failed to apply the SMART baseline:", error);
    return disks;
  }
};
