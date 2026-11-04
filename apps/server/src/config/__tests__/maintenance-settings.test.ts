import { expect, test } from "bun:test";
import type { MaintenanceSettings } from "@shared/types.ts";
import { DEFAULT_MAINTENANCE_SETTINGS, normalizeMaintenanceSettings } from "../maintenance-settings.ts";

const withPause = (dockerPause: Partial<MaintenanceSettings["dockerPause"]>) => ({
  ...DEFAULT_MAINTENANCE_SETTINGS,
  dockerPause: { ...DEFAULT_MAINTENANCE_SETTINGS.dockerPause, enabled: true, ...dockerPause },
});

test("normalizeMaintenanceSettings - trims and deduplicates containers, drops unknown commands", () => {
  const { settings, error } = normalizeMaintenanceSettings(
    withPause({ containers: [" immich ", "immich", "", "nextcloud"], commands: ["sync", "status", "scrub"] }),
  );
  expect(error).toEqual(undefined);
  expect(settings.dockerPause.containers).toEqual(["immich", "nextcloud"]);
  expect(settings.dockerPause.commands).toEqual(["sync", "scrub"]);
});

test("normalizeMaintenanceSettings - older files get the defaults of newer fields", () => {
  const { settings } = normalizeMaintenanceSettings({ spindown: { enabled: true } } as Partial<MaintenanceSettings>);
  expect(settings.spindown).toEqual({ enabled: true, idleMinutes: 30 });
  expect(settings.dockerPause).toEqual(DEFAULT_MAINTENANCE_SETTINGS.dockerPause);
});

test("normalizeMaintenanceSettings - rejects a relative socket, no jobs and a too short idle time", () => {
  expect(typeof normalizeMaintenanceSettings(withPause({ socketPath: "docker.sock" })).error).toEqual("string");
  expect(typeof normalizeMaintenanceSettings(withPause({ commands: [] })).error).toEqual("string");
  expect(typeof normalizeMaintenanceSettings({ ...DEFAULT_MAINTENANCE_SETTINGS, spindown: { enabled: true, idleMinutes: 1 } })
      .error).toEqual("string");
});

test("normalizeMaintenanceSettings - the MCP endpoint needs a long token", () => {
  const withMcp = (token: string) => ({
    ...DEFAULT_MAINTENANCE_SETTINGS,
    mcp: { enabled: true, token, allowActions: true },
  });
  expect(typeof normalizeMaintenanceSettings(withMcp("")).error).toEqual("string");
  expect(typeof normalizeMaintenanceSettings(withMcp("short")).error).toEqual("string");
  const { settings, error } = normalizeMaintenanceSettings(withMcp("  0123456789abcdef0123  "));
  expect(error).toEqual(undefined);
  expect(settings.mcp.token).toEqual("0123456789abcdef0123");
  // Settings written before the endpoint existed
  expect(normalizeMaintenanceSettings({}).settings.mcp).toEqual(DEFAULT_MAINTENANCE_SETTINGS.mcp);
});
