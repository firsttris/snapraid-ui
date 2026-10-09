// Which engine runs SnapRAID (engine.json), and the engine built from it
import { existsSync } from "@std/fs";
import { type DaemonCheck, type DaemonTarget, type DaemonWarning, type EngineSettings, SECRET_MASK } from "@shared/types.ts";
import { resolveFromBase } from "../config.ts";
import { createDaemonClient, createDaemonEngine, type DaemonArray, DaemonError } from "./daemon-engine.ts";
import type { SnapRaidEngine } from "./engine.ts";

const SETTINGS_FILE = "engine.json";

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = { mode: "cli", daemons: [] };

const EMPTY_TARGET: DaemonTarget = { configPath: "", url: "", username: "", password: "" };

const settingsPath = () => resolveFromBase(SETTINGS_FILE);

const withDefaults = (stored: Partial<EngineSettings>): EngineSettings => ({
  mode: stored.mode === "daemon" ? "daemon" : "cli",
  daemons: (Array.isArray(stored.daemons) ? stored.daemons : []).map((target) => ({ ...EMPTY_TARGET, ...target })),
});

export const loadEngineSettings = async (): Promise<EngineSettings> => {
  const path = settingsPath();
  if (!existsSync(path)) return DEFAULT_ENGINE_SETTINGS;
  try {
    return withDefaults(JSON.parse(await Deno.readTextFile(path)));
  } catch (error) {
    console.error(`Failed to read ${path}, using the SnapRAID CLI:`, error);
    return DEFAULT_ENGINE_SETTINGS;
  }
};

export const saveEngineSettings = async (settings: EngineSettings): Promise<void> => {
  // Holds the daemons' passwords
  await Deno.writeTextFile(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
};

/**
 * Settings as sent to the browser, without the stored passwords
 */
export const maskEngineSecrets = (settings: EngineSettings): EngineSettings => ({
  ...settings,
  daemons: settings.daemons.map((target) => ({ ...target, password: target.password ? SECRET_MASK : "" })),
});

const sameConfig = (a: string, b: string) => resolveFromBase(a) === resolveFromBase(b);

/**
 * A daemon from the browser, cleaned up; a masked password stands for the one stored for its config
 */
export const normalizeTarget = (target: DaemonTarget, stored: EngineSettings): DaemonTarget => {
  const configPath = target.configPath.trim();
  const previous = stored.daemons.find((entry) => sameConfig(entry.configPath, configPath));
  return {
    configPath,
    url: target.url.trim().replace(/\/+$/, ""),
    username: target.username.trim(),
    password: target.password === SECRET_MASK ? previous?.password ?? "" : target.password,
  };
};

/**
 * Settings from the browser, completed and checked
 */
export const normalizeEngineSettings = (
  incoming: Partial<EngineSettings>,
  stored: EngineSettings,
): { settings: EngineSettings; error?: string } => {
  const settings = withDefaults(incoming);
  const normalized = { ...settings, daemons: settings.daemons.map((target) => normalizeTarget(target, stored)) };
  if (settings.mode !== "daemon") return { settings: normalized };

  if (normalized.daemons.length === 0) return { settings: normalized, error: "Add the daemon of at least one configuration" };
  for (const [index, target] of normalized.daemons.entries()) {
    if (!target.configPath) return { settings: normalized, error: "Pick the configuration each daemon serves" };
    if (!/^https?:\/\/[^/]+/.test(target.url)) {
      return { settings: normalized, error: "The daemon URL must start with http:// or https://" };
    }
    if (normalized.daemons.slice(0, index).some((other) => sameConfig(other.configPath, target.configPath))) {
      return { settings: normalized, error: "Each configuration can have only one daemon" };
    }
  }
  return { settings: normalized };
};

/**
 * The engine for the settings: the CLI, or each listed config on its daemon and the others on the CLI.
 * One job runs at a time across all of them, like with the CLI alone.
 */
export const buildEngine = (
  settings: EngineSettings,
  cli: SnapRaidEngine,
  createDaemon: typeof createDaemonEngine = createDaemonEngine,
): SnapRaidEngine => {
  if (settings.mode !== "daemon" || settings.daemons.length === 0) return cli;
  const daemons = new Map(
    settings.daemons.map((target) => [resolveFromBase(target.configPath), createDaemon({ ...target, fallback: cli })]),
  );
  const engines = [...daemons.values(), cli];
  const pick = (configPath: string) => daemons.get(resolveFromBase(configPath)) ?? cli;
  return {
    kind: "daemon",
    runJob: (request) => pick(request.configPath).runJob(request),
    abortJob: (processId) => engines.some((engine) => engine.abortJob(processId)),
    currentJob: () => engines.map((engine) => engine.currentJob()).find((job) => job !== null) ?? null,
    currentOutput: () => engines.find((engine) => engine.currentJob())?.currentOutput() ?? "",
    lastJob: () =>
      engines
        .map((engine) => engine.lastJob())
        .filter((job) => job !== null)
        .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0] ?? null,
    onProgress: (listener) => engines.forEach((engine) => engine.onProgress(listener)),
    readStatus: (configPath) => pick(configPath).readStatus(configPath),
    readDiff: (configPath) => pick(configPath).readDiff(configPath),
    readSmart: (configPath) => pick(configPath).readSmart(configPath),
    readPowerStates: (configPath) => pick(configPath).readPowerStates(configPath),
    readLastRuns: (configPath) => pick(configPath).readLastRuns(configPath),
  };
};

interface DaemonConfig {
  maintenance_schedule?: string;
  spindown_idle_minutes?: string | number;
  hook_docker_pause?: string;
  notify_result?: string;
  notify_start?: string;
}

const isSet = (value: string | number | undefined) => value !== undefined && String(value).trim() !== "" && String(value).trim() !== "0";

/**
 * Whether the daemon answers, which array it serves, and what it does on its own that
 * SnapRAID UI also does (they would both run)
 */
export const checkDaemon = async (
  settings: DaemonTarget,
  fetchFn: typeof fetch = fetch,
): Promise<DaemonCheck> => {
  const client = createDaemonClient(settings, fetchFn);
  try {
    const [array, config] = await Promise.all([
      client.get<DaemonArray & { daemon_version?: string; engine_version?: string }>("/v1/array"),
      client.get<DaemonConfig>("/v2/config"),
    ]);
    const warnings: DaemonWarning[] = [];
    if (isSet(config.maintenance_schedule)) warnings.push("schedule");
    if (isSet(config.spindown_idle_minutes)) warnings.push("spindown");
    if (isSet(config.hook_docker_pause)) warnings.push("docker_pause");
    if (isSet(config.notify_result) || isSet(config.notify_start)) warnings.push("notifications");
    if (settings.configPath && array.engine_conf && array.engine_conf !== resolveFromBase(settings.configPath)) {
      warnings.push("other_array");
    }
    return {
      ok: true,
      daemonVersion: array.daemon_version,
      engineVersion: array.engine_version,
      engineConf: array.engine_conf,
      warnings,
    };
  } catch (error) {
    return { ok: false, error: error instanceof DaemonError ? error.message : String(error), warnings: [] };
  }
};
