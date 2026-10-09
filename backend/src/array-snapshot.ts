// What SnapRAID UI knows about its arrays right now, without running SnapRAID or smartctl:
// the last runs from the logs (or the daemon), the last status read, the usage and SMART
// histories. The Prometheus metrics and Home Assistant are built from it.
import type { Schedule } from "@shared/types.ts";
import { loadAppConfig } from "./config-parser.ts";
import { resolveFromBase } from "./config.ts";
import { getEngine } from "./engine/engine.ts";
import type { LogManager } from "./log-manager.ts";
import type { ConfigMetrics } from "./metrics.ts";
import { getSmartHistory } from "./smart-history.ts";
import { lastStatus } from "./status-cache.ts";
import { getUsageHistory } from "./usage-history.ts";

const sources = {
  logManager: null as LogManager | null,
  schedules: (() => Promise.resolve([])) as () => Promise<Schedule[]>,
};

export const setSnapshotSources = (logManager: LogManager, schedules: () => Promise<Schedule[]>): void => {
  sources.logManager = logManager;
  sources.schedules = schedules;
};

export const snapshotSchedules = () => sources.schedules();

const lastRunsOf = async (configPath: string) => {
  const fromEngine = await getEngine().readLastRuns(configPath).catch(() => null);
  if (fromEngine || !sources.logManager) return fromEngine;
  const [sync, scrub] = await Promise.all([
    sources.logManager.findLastRun("sync", configPath),
    sources.logManager.findLastRun("scrub", configPath),
  ]);
  return { sync, scrub };
};

/**
 * The enabled configs with what is known about them
 */
export const snapshotConfigs = async (): Promise<ConfigMetrics[]> => {
  const appConfig = await loadAppConfig();
  return Promise.all(
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
};
