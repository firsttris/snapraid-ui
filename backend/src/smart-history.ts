import { existsSync } from "@std/fs";
import type { SmartDiskInfo, SmartHistoryPoint } from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";

const STATE_FILE = "smart-history.json";
// One point per disk and day is enough for slow trends, a year shows the long ones
const MAX_POINTS = 365;

interface DiskHistory {
  configPath: string;
  name: string;
  points: SmartHistoryPoint[];
}

export type SmartHistoryState = Record<string, DiskHistory>;

const diskKey = (configPath: string, disk: SmartDiskInfo) => disk.serial ?? `${configPath}|${disk.name}`;

const rawOf = (disk: SmartDiskInfo, id: number): number | undefined => {
  const raw = disk.attributes?.find((attribute) => attribute.id === id)?.raw;
  const count = parseInt(raw ?? "", 10);
  return Number.isNaN(count) ? undefined : count;
};

const pointOf = (disk: SmartDiskInfo, date: string): SmartHistoryPoint => ({
  date,
  temperature: disk.temperature,
  reallocated: rawOf(disk, 5),
  pending: rawOf(disk, 197),
  crc: rawOf(disk, 199),
  wear: disk.wearLevel,
  mediaErrors: disk.errorMedium,
});

/**
 * Adds today's values of each disk, a later read on the same day replaces them.
 * Sleeping disks report nothing and are skipped.
 */
export const addSmartPoints = (
  configPath: string,
  disks: SmartDiskInfo[],
  previous: SmartHistoryState,
  now = new Date(),
): SmartHistoryState => {
  const state = { ...previous };
  const date = now.toISOString().slice(0, 10);
  disks.forEach((disk) => {
    if (disk.standby || disk.status === "UNKNOWN") return;
    const key = diskKey(configPath, disk);
    const points = (state[key]?.points ?? []).filter((point) => point.date !== date);
    points.push(pointOf(disk, date));
    state[key] = { configPath, name: disk.name, points: points.slice(-MAX_POINTS) };
  });
  return state;
};

const loadState = async (): Promise<SmartHistoryState> => {
  const path = resolveFromBase(STATE_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {};
  }
};

/**
 * Remember the values of a SMART read, never fails the read itself
 */
export const recordSmartHistory = async (configPath: string, disks: SmartDiskInfo[]): Promise<void> => {
  try {
    const state = addSmartPoints(configPath, disks, await loadState());
    await Deno.writeTextFile(resolveFromBase(STATE_FILE), JSON.stringify(state));
  } catch (error) {
    console.error("Failed to record the SMART history:", error);
  }
};

/**
 * History of the disks of one config, by disk name
 */
export const getSmartHistory = async (configPath: string): Promise<Record<string, SmartHistoryPoint[]>> =>
  Object.fromEntries(
    Object.values(await loadState())
      .filter((disk) => disk.configPath === configPath)
      .map((disk) => [disk.name, disk.points]),
  );
