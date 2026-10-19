import { assertEquals } from "@std/assert";
import type { MaintenanceSettings } from "@shared/types.ts";
import { DEFAULT_MAINTENANCE_SETTINGS, normalizeMaintenanceSettings } from "../maintenance-settings.ts";

const withPause = (dockerPause: Partial<MaintenanceSettings["dockerPause"]>) => ({
  ...DEFAULT_MAINTENANCE_SETTINGS,
  dockerPause: { ...DEFAULT_MAINTENANCE_SETTINGS.dockerPause, enabled: true, ...dockerPause },
});

Deno.test("normalizeMaintenanceSettings - trims and deduplicates containers, drops unknown commands", () => {
  const { settings, error } = normalizeMaintenanceSettings(
    withPause({ containers: [" immich ", "immich", "", "nextcloud"], commands: ["sync", "status", "scrub"] }),
  );
  assertEquals(error, undefined);
  assertEquals(settings.dockerPause.containers, ["immich", "nextcloud"]);
  assertEquals(settings.dockerPause.commands, ["sync", "scrub"]);
});

Deno.test("normalizeMaintenanceSettings - older files get the defaults of newer fields", () => {
  const { settings } = normalizeMaintenanceSettings({ spindown: { enabled: true } } as Partial<MaintenanceSettings>);
  assertEquals(settings.spindown, { enabled: true, idleMinutes: 30 });
  assertEquals(settings.dockerPause, DEFAULT_MAINTENANCE_SETTINGS.dockerPause);
});

Deno.test("normalizeMaintenanceSettings - rejects a relative socket, no jobs and a too short idle time", () => {
  assertEquals(typeof normalizeMaintenanceSettings(withPause({ socketPath: "docker.sock" })).error, "string");
  assertEquals(typeof normalizeMaintenanceSettings(withPause({ commands: [] })).error, "string");
  assertEquals(
    typeof normalizeMaintenanceSettings({ ...DEFAULT_MAINTENANCE_SETTINGS, spindown: { enabled: true, idleMinutes: 1 } })
      .error,
    "string",
  );
});

Deno.test("normalizeMaintenanceSettings - the MCP endpoint needs a long token", () => {
  const withMcp = (token: string) => ({
    ...DEFAULT_MAINTENANCE_SETTINGS,
    mcp: { enabled: true, token, allowActions: true },
  });
  assertEquals(typeof normalizeMaintenanceSettings(withMcp("")).error, "string");
  assertEquals(typeof normalizeMaintenanceSettings(withMcp("short")).error, "string");
  const { settings, error } = normalizeMaintenanceSettings(withMcp("  0123456789abcdef0123  "));
  assertEquals(error, undefined);
  assertEquals(settings.mcp.token, "0123456789abcdef0123");
  // Settings written before the endpoint existed
  assertEquals(normalizeMaintenanceSettings({}).settings.mcp, DEFAULT_MAINTENANCE_SETTINGS.mcp);
});
