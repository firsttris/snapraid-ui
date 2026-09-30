import { dirname } from "@std/path";
import { existsSync } from "@std/fs";
import type { DiskReplacement, ReplacementStep, ReplacementStepResult } from "@shared/types.ts";
import { parseParityLine } from "./config-parser.ts";
import { resolveFromBase } from "./config.ts";

/**
 * Replacing a failed disk follows "Recovering" in the SnapRAID manual:
 * 1. point the `data` or `parity` line to the new disk, 2. `fix -d NAME`,
 * 3. optionally `check -a -d NAME`, 4. `sync`.
 * Scheduled jobs of the config are paused until the sync is done.
 */

export class DiskReplacementError extends Error {}

const STATE_FILE = "replacements.json";

const DATA_LINE = /^data\s+(\S+)\s+(.+)$/;

const trimSlash = (path: string): string => path.length > 1 ? path.replace(/\/+$/, "") : path;

// Content files stored on the replaced disk move along with it
const moveContentLines = (lines: string[], fromDir: string, toDir: string): string[] => {
  if (trimSlash(fromDir) === trimSlash(toDir)) return lines;
  const prefix = `${trimSlash(fromDir)}/`;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("content ")) return line;
    const path = trimmed.substring(8).trim();
    return path.startsWith(prefix) ? `content ${trimSlash(toDir)}/${path.substring(prefix.length)}` : line;
  });
};

/**
 * Step 1: point the disk to its new location.
 * `diskName` is a data disk name or a parity keyword such as `parity` or `2-parity`.
 */
export const applyReplacementPath = (
  config: string,
  diskName: string,
  newPath: string,
): { config: string; diskType: "data" | "parity"; oldPath: string } => {
  const lines = config.split("\n");

  const dataIndex = lines.findIndex((line) => line.trim().match(DATA_LINE)?.[1] === diskName);
  if (dataIndex !== -1) {
    const oldPath = lines[dataIndex].trim().match(DATA_LINE)![2].trim();
    const updated = lines.map((line, i) => (i === dataIndex ? `data ${diskName} ${newPath}` : line));
    return {
      config: moveContentLines(updated, oldPath, newPath).join("\n"),
      diskType: "data",
      oldPath,
    };
  }

  const parityIndex = lines.findIndex((line) => parseParityLine(line)?.keyword === diskName);
  if (parityIndex !== -1) {
    const parity = parseParityLine(lines[parityIndex])!;
    const oldPath = parity.paths.join(",");
    if (newPath === oldPath) return { config, diskType: "parity", oldPath };
    if (parity.paths.length > 1) {
      throw new DiskReplacementError("Split parity can only be replaced in place, edit the config to move it");
    }
    if (!newPath.endsWith(".parity")) {
      throw new DiskReplacementError("Parity file path must end with .parity");
    }
    const updated = lines.map((line, i) => (i === parityIndex ? `${diskName} ${newPath}` : line));
    return {
      config: moveContentLines(updated, dirname(oldPath), dirname(newPath)).join("\n"),
      diskType: "parity",
      oldPath,
    };
  }

  throw new DiskReplacementError(`Disk '${diskName}' not found`);
};

/**
 * The directory the new disk must provide: the data directory, or the one holding the parity file
 */
export const requiredDirectory = (diskType: "data" | "parity", newPath: string): string =>
  diskType === "data" ? newPath : dirname(newPath);

// ====================
// State, keyed by the resolved config path
// ====================

type ReplacementState = Record<string, DiskReplacement>;

const statePath = () => resolveFromBase(STATE_FILE);

const loadState = async (): Promise<ReplacementState> => {
  if (!existsSync(statePath())) return {};
  try {
    return JSON.parse(await Deno.readTextFile(statePath()));
  } catch {
    return {};
  }
};

const saveState = (state: ReplacementState) => Deno.writeTextFile(statePath(), JSON.stringify(state, null, 2));

export const getReplacement = async (configPath: string): Promise<DiskReplacement | null> =>
  (await loadState())[resolveFromBase(configPath)] ?? null;

export const saveReplacement = async (replacement: DiskReplacement): Promise<void> => {
  const state = await loadState();
  await saveState({ ...state, [resolveFromBase(replacement.configPath)]: replacement });
};

export const recordReplacementStep = async (
  configPath: string,
  step: ReplacementStep,
  result: ReplacementStepResult,
): Promise<DiskReplacement | null> => {
  const replacement = await getReplacement(configPath);
  if (!replacement) return null;
  const successful = result.result === "ok" || result.result === "warning";
  const updated: DiskReplacement = {
    ...replacement,
    // A new fix makes an earlier check outdated
    steps: step === "fix" ? { fix: result } : { ...replacement.steps, [step]: result },
    completedAt: step === "sync" && successful ? result.finishedAt : replacement.completedAt,
  };
  await saveReplacement(updated);
  return updated;
};

export const clearReplacement = async (configPath: string): Promise<void> => {
  const state = await loadState();
  const key = resolveFromBase(configPath);
  if (!(key in state)) return;
  delete state[key];
  await saveState(state);
};

/**
 * Scheduled jobs of a config wait while one of its disks is being replaced
 */
export const isReplacementInProgress = async (configPath: string): Promise<boolean> => {
  const replacement = await getReplacement(configPath);
  return !!replacement && !replacement.completedAt;
};
