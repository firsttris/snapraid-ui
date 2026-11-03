import { Hono } from "hono";
import type { DockerContainersReport, MaintenanceSettings } from "@shared/types.ts";
import {
  loadMaintenanceSettings,
  normalizeMaintenanceSettings,
  saveMaintenanceSettings,
} from "../maintenance-settings.ts";
import { dockerSocket, listContainers, ownContainerId } from "../docker.ts";
import type { SpindownMonitor } from "../spindown.ts";

const maintenance = new Hono();

const state = {
  spindown: null as SpindownMonitor | null,
};

export const setSpindownMonitor = (monitor: SpindownMonitor): void => {
  state.spindown = monitor;
};

// GET /api/maintenance - Docker pause and spindown settings
maintenance.get("/", async (c) => {
  return c.json(await loadMaintenanceSettings());
});

// PUT /api/maintenance - Save settings
maintenance.put("/", async (c) => {
  try {
    const { settings, error } = normalizeMaintenanceSettings(await c.req.json<Partial<MaintenanceSettings>>());
    if (error) return c.json({ error }, 400);

    await saveMaintenanceSettings(settings);
    state.spindown?.refresh();
    return c.json(settings);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/maintenance/containers - Containers on the Docker socket, to pick the ones to pause
maintenance.get("/containers", async (c) => {
  const socketPath = c.req.query("socket") || (await loadMaintenanceSettings()).dockerPause.socketPath;
  try {
    const report: DockerContainersReport = {
      available: true,
      containers: await listContainers(dockerSocket(socketPath), await ownContainerId()),
    };
    return c.json(report);
  } catch (error) {
    const report: DockerContainersReport = {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      containers: [],
    };
    return c.json(report);
  }
});

// GET /api/maintenance/spindown - Disks the spindown watches and when they were last active
maintenance.get("/spindown", async (c) => {
  if (!state.spindown) return c.json({ error: "Spindown not initialized" }, 500);
  return c.json(await state.spindown.status());
});

export { maintenance as maintenanceRoutes };
