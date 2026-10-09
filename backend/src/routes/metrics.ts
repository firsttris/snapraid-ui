import { Hono } from "hono";
import { snapshotConfigs, snapshotSchedules } from "../array-snapshot.ts";
import { getEngine } from "../engine/engine.ts";
import { loadMaintenanceSettings } from "../maintenance-settings.ts";
import { renderMetrics } from "../metrics.ts";

const metrics = new Hono();

// GET /api/metrics - Prometheus metrics; open to scrapers without a session (the login does not
// apply), off unless enabled under Automation, and with a token when one is set there
metrics.get("/", async (c) => {
  const { metrics: settings } = await loadMaintenanceSettings();
  if (!settings.enabled) return c.json({ error: "Metrics are disabled" }, 404);
  if (settings.token && c.req.header("authorization") !== `Bearer ${settings.token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [configs, schedules] = await Promise.all([snapshotConfigs(), snapshotSchedules()]);
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.body(renderMetrics({ configs, schedules, job: getEngine().currentJob() }));
});

export { metrics as metricsRoutes };
