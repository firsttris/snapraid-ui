import { existsSync } from "@std/fs";
import { dirname, isAbsolute, normalize } from "@std/path";
import type { AppConfig, SettingsBackup } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";
import { resolveFromBase } from "./config.ts";

// Settings and history next to config.json; logs and replacement runs stay behind
const STATE_FILES = [
  "config.json",
  "schedules.json",
  "notifications.json",
  "maintenance.json",
  "engine.json",
  "home-assistant.json",
  "smart-baseline.json",
  "smart-history.json",
  "usage-history.json",
];

// A SnapRAID config inside the data folder; one elsewhere on the host is not written back
const isRestorableConfig = (path: string) =>
  path.endsWith(".conf") && !isAbsolute(path) && !normalize(path).split(/[\\/]/).includes("..");

const readIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return undefined;
  }
};

const configPaths = (configJson: string | undefined): string[] => {
  if (!configJson) return [];
  try {
    return (JSON.parse(configJson) as AppConfig).snapraidConfigs?.map((config) => config.path) ?? [];
  } catch {
    return [];
  }
};

/**
 * The settings, histories and SnapRAID configs as one file
 */
export const createBackup = async (): Promise<SettingsBackup> => {
  const files: Record<string, string> = {};
  for (const name of STATE_FILES) {
    const content = await readIfPresent(resolveFromBase(name));
    if (content !== undefined) files[name] = content;
  }
  for (const path of configPaths(files["config.json"])) {
    const content = await readIfPresent(resolveFromBase(path));
    if (content !== undefined) files[path] = content;
  }
  return { app: "snapraid-ui", version: 1, exportedAt: new Date().toISOString(), files };
};

export class BackupError extends Error {}

/**
 * Which files of a backup are written back, and which are left out
 */
export const planRestore = (backup: unknown): { write: Record<string, string>; skipped: string[] } => {
  const candidate = backup as Partial<SettingsBackup> | null;
  if (candidate?.app !== "snapraid-ui" || candidate.version !== 1 || typeof candidate.files !== "object" || !candidate.files) {
    throw new BackupError(msg("server_error_backup_invalid"));
  }
  const files = candidate.files as Record<string, unknown>;
  const configs = new Set(configPaths(typeof files["config.json"] === "string" ? files["config.json"] : undefined));
  const write: Record<string, string> = {};
  const skipped: string[] = [];

  Object.entries(files).forEach(([path, content]) => {
    if (typeof content !== "string") return skipped.push(path);
    if (STATE_FILES.includes(path)) {
      try {
        JSON.parse(content);
      } catch {
        return skipped.push(path);
      }
      write[path] = content;
    } else if (configs.has(path) && isRestorableConfig(path)) {
      write[path] = content;
    } else {
      skipped.push(path);
    }
  });
  return { write, skipped };
};

/**
 * Write a backup back; files it does not contain stay as they are
 */
export const restoreBackup = async (backup: unknown): Promise<{ restored: string[]; skipped: string[] }> => {
  const { write, skipped } = planRestore(backup);
  for (const [path, content] of Object.entries(write)) {
    const target = resolveFromBase(path);
    if (!existsSync(dirname(target))) await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.writeTextFile(target, content);
  }
  return { restored: Object.keys(write), skipped };
};
