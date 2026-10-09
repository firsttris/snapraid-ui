import { Hono } from "hono";
import type { Schedule } from "@shared/types.ts";
import { loadAppConfig } from "../config-parser.ts";
import { resolveFromBase } from "../config.ts";
import { getEngine } from "../engine/engine.ts";
import type { LogManager } from "../log-manager.ts";
import { loadMaintenanceSettings } from "../maintenance-settings.ts";
import { type ConfigMetrics, renderMetrics } from "../metrics.ts";
import { getSmartHistory } from "../smart-history.ts";
import { lastStatus } from "../status-cache.ts";
import { getUsageHistory } from "../usage-history.ts";

const metrics = new Hono();

const state = {
  logManager: null as LogManager | null,
  schedules: (() => Promise.resolve([])) as () => Promise<Schedule[]>,
};

export const setMetricsSources = (logManager: LogManager, schedules: () => Promise<Schedule[]>): void => {
  state.logManager = logManager;
  state.schedules = schedules;
};

const lastRunsOf = async (configPath: string) => {
  const fromEngine = await getEngine().readLastRuns(configPath).catch(() => null);
  if (fromEngine || !state.logManager) return fromEngine;
  const [sync, scrub] = await Promise.all([
    state.logManager.findLastRun("sync", configPath),
    state.logManager.findLastRun("scrub", configPath),
  ]);
  return { sync, scrub };
};

// GET /api/metrics - Prometheus metrics; open to scrapers without a session (the login does not
// apply), off unless enabled under Automation, and with a token when one is set there
metrics.get("/", async (c) => {
  const { metrics: settings } = await loadMaintenanceSettings();
  if (!settings.enabled) return c.json({ error: "Metrics are disabled" }, 404);
  if (settings.token && c.req.header("authorization") !== `Bearer ${settings.token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const appConfig = await loadAppConfig();
  const configs: ConfigMetrics[] = await Promise.all(
    appConfig.snapraidConfigs.filter((config) => config.enabled).map(async (config) => {
      const path = resolveFromBase(config.path);
      const [lastRuns, usage, smart] = await Promise.all([
        lastRunsOf(path),
        getUsageHistory(path),
        getSmartHistory(path),
      ]);
      return {
        name: config.name,
        path,
        lastRuns,
        status: lastStatus(path),
        usage: usage.at(-1),
        smart: Object.fromEntries(Object.entries(smart).map(([disk, points]) => [disk, points.at(-1)])),
      };
    }),
  );

  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.body(renderMetrics({ configs, schedules: await state.schedules(), job: getEngine().currentJob() }));
});

export { metrics as metricsRoutes };
