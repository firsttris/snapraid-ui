import { existsSync } from "@std/fs";
import type { MaintenanceSettings, SnapRaidCommand } from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";

const SETTINGS_FILE = "maintenance.json";

export const DEFAULT_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  dockerPause: {
    enabled: false,
    socketPath: "/var/run/docker.sock",
    containers: [],
    // The jobs that read every file; a file changed meanwhile ends up with wrong parity or as an error
    commands: ["sync", "scrub"],
  },
  spindown: {
    enabled: false,
    idleMinutes: 30,
  },
};

// Commands worth pausing containers for, the others are quick or only read the content file
export const PAUSABLE_COMMANDS: SnapRaidCommand[] = ["sync", "scrub", "check", "fix", "touch"];

const settingsPath = () => resolveFromBase(SETTINGS_FILE);

// Fills settings written by an older version with the defaults of newer fields
const withDefaults = (stored: Partial<MaintenanceSettings>): MaintenanceSettings => ({
  dockerPause: { ...DEFAULT_MAINTENANCE_SETTINGS.dockerPause, ...stored.dockerPause },
  spindown: { ...DEFAULT_MAINTENANCE_SETTINGS.spindown, ...stored.spindown },
});

export const loadMaintenanceSettings = async (): Promise<MaintenanceSettings> => {
  const path = settingsPath();
  if (!existsSync(path)) return DEFAULT_MAINTENANCE_SETTINGS;
  try {
    return withDefaults(JSON.parse(await Deno.readTextFile(path)));
  } catch (error) {
    console.error(`Failed to read ${path}, using the defaults:`, error);
    return DEFAULT_MAINTENANCE_SETTINGS;
  }
};

/**
 * Settings from the browser, completed and cleaned up; the error explains what is invalid
 */
export const normalizeMaintenanceSettings = (
  incoming: Partial<MaintenanceSettings>,
): { settings: MaintenanceSettings; error?: string } => {
  const settings = withDefaults(incoming);
  const containers = [...new Set(settings.dockerPause.containers.map((name) => name.trim()).filter(Boolean))];
  const commands = settings.dockerPause.commands.filter((command) => PAUSABLE_COMMANDS.includes(command));
  const normalized: MaintenanceSettings = {
    dockerPause: { ...settings.dockerPause, socketPath: settings.dockerPause.socketPath.trim(), containers, commands },
    spindown: { ...settings.spindown, idleMinutes: Math.round(settings.spindown.idleMinutes) },
  };

  const { dockerPause, spindown } = normalized;
  if (dockerPause.enabled && !dockerPause.socketPath.startsWith("/")) {
    return { settings: normalized, error: "The Docker socket must be an absolute path" };
  }
  if (dockerPause.enabled && dockerPause.commands.length === 0) {
    return { settings: normalized, error: "Pick at least one job to pause the containers for" };
  }
  if (!(spindown.idleMinutes >= 5 && spindown.idleMinutes <= 1440)) {
    return { settings: normalized, error: "The idle time must be between 5 and 1440 minutes" };
  }
  return { settings: normalized };
};

export const saveMaintenanceSettings = async (settings: MaintenanceSettings): Promise<void> => {
  await Deno.writeTextFile(settingsPath(), JSON.stringify(settings, null, 2));
};
