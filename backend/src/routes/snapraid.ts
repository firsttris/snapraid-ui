import { Hono } from "hono";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { createSnapRaidRunner } from "../snapraid-runner.ts";
import type { LogManager } from "../log-manager.ts";
import type { SnapRaidCommand } from "@shared/types.ts";
import { snapraidCommand, resolveFromBase } from "../config.ts";
import {diskManagementRoutes} from "./disk-management.ts";
import { DiskRemovalError, ensureEmptyDir, finalizeDataDiskRemoval, prepareDataDiskRemoval } from "../disk-removal.ts";
import {configOperationsRoutes} from "./config-operations.ts";
import {hardwareRoutes} from "./hardware.ts";
import { setReportsRunner, reportsRoutes } from "./reports.ts";
import { getUsageHistory, recordUsage } from "../usage-history.ts";
import { parseStatusOutput } from "../parsers/status-parser.ts";
import { parseCheckOutput } from "../parsers/check-parser.ts";
import { createDiskReplacementRoutes } from "./disk-replacement.ts";
import { notifyManualRun } from "../notification-events.ts";
import { findDiskIssues } from "../disk-check.ts";
import { msg } from "@shared/i18n.ts";
import { EngineBusyError, getEngine, type JobOutcome } from "../engine/engine.ts";

const snapraid = new Hono();

const runner = createSnapRaidRunner();
const commandHistory: JobOutcome[] = [];
const MAX_HISTORY = 50;

// Broadcast function will be injected
const state = {
  broadcastFn: (() => {}) as (message: unknown) => void,
  logManager: null as LogManager | null,
};

export const setBroadcast = (fn: (message: unknown) => void): void => {
  state.broadcastFn = fn;
};

export const setSnapraidLogManager = (logManager: LogManager): void => {
  state.logManager = logManager;
};

// Initialize runner for reports module
setReportsRunner(runner);

// Mount sub-routes
snapraid.route("/", diskManagementRoutes);
snapraid.route("/", configOperationsRoutes);
snapraid.route("/", hardwareRoutes);
snapraid.route("/", reportsRoutes);
snapraid.route("/", createDiskReplacementRoutes({
  startJob: (...args) => startJob(...args),
  isBusy: () => !!getEngine().currentJob(),
}));

// Manually started commands worth a notification, when enabled in the settings
const NOTIFIED_MANUAL_COMMANDS: SnapRaidCommand[] = ["sync", "scrub", "fix", "check"];

// GET /api/snapraid/parse - Parse SnapRAID config
snapraid.get("/parse", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json(parsed);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/current-job - Get current running job
snapraid.get("/current-job", (c) => {
  return c.json(getEngine().currentJob());
});

// GET /api/snapraid/last-job - Outcome of the last finished job, for clients that missed its completion
snapraid.get("/last-job", (c) => {
  return c.json(getEngine().lastJob());
});

// POST /api/snapraid/abort - Abort the running job
snapraid.post("/abort", (c) => {
  const currentJob = getEngine().currentJob();
  if (!currentJob) {
    return c.json({ error: msg("server_error_no_job") }, 404);
  }

  const aborted = getEngine().abortJob(currentJob.processId);
  return c.json({ success: aborted });
});

// GET /api/snapraid/last-runs - Last sync and scrub of a config
snapraid.get("/last-runs", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }
  if (!state.logManager) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  const configPath = resolveFromBase(relativePath);
  const job = getEngine().currentJob();
  const runningLog = job?.configPath === configPath ? job.logFile : undefined;

  try {
    // snapraid-daemon keeps its own task history, its runs are not in the UI's logs
    const fromEngine = await getEngine().readLastRuns(configPath);
    if (fromEngine) return c.json(fromEngine);

    const [sync, scrub] = await Promise.all([
      state.logManager.findLastRun("sync", configPath, runningLog),
      state.logManager.findLastRun("scrub", configPath, runningLog),
    ]);
    return c.json({ sync, scrub });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/check-report - Files the last check of a config found, read from its log.
// check reads the whole array and runs as a job, so the report comes afterwards
snapraid.get("/check-report", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }
  if (!state.logManager) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  try {
    const lastRun = await state.logManager.findLastRun("check", resolveFromBase(relativePath));
    if (!lastRun) {
      return c.json({ error: msg("server_error_no_check_yet") }, 404);
    }
    const log = await state.logManager.readLog(lastRun.logFile);
    return c.json({
      ...parseCheckOutput(log),
      timestamp: lastRun.timestamp,
      rawOutput: "",
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * Run a command in the background, streaming output and result via WebSocket
 */
const startJob = (
  command: SnapRaidCommand,
  configPath: string,
  args: string[],
  afterRun?: (outcome: JobOutcome) => Promise<void>,
): void => {
  (async () => {
    const engine = getEngine();
    try {
      const outcome = await engine.runJob({
        command,
        configPath,
        args,
        onOutput: (chunk) => {
          state.broadcastFn({
            type: "output",
            command,
            chunk,
            timestamp: new Date().toISOString(),
          });
        },
        afterRun,
      });
      const result = outcome.output;

      // Add to history
      commandHistory.unshift(outcome);
      if (commandHistory.length > MAX_HISTORY) {
        commandHistory.pop();
      }

      // Send completion message
      state.broadcastFn({
        type: "complete",
        command,
        processId: engine.lastJob()?.processId,
        forceOption: engine.lastJob()?.forceOption,
        exitCode: result.exitCode,
        aborted: result.aborted,
        timestamp: result.timestamp,
      });

      if (NOTIFIED_MANUAL_COMMANDS.includes(command)) {
        await notifyManualRun(configPath, outcome.report);
      }

      // Parse status if it was a status or diff command
      if (command === "status" || command === "diff") {
        const log = outcome.report.log;
        const status = { ...parseStatusOutput(log, result.output), diskIssues: await findDiskIssues(log) };
        state.broadcastFn({
          type: "status",
          status,
        });
      }
    } catch (error) {
      state.broadcastFn({
        type: "error",
        command,
        processId: engine.lastJob()?.processId,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  })();
};

// POST /api/snapraid/execute - Execute SnapRAID command
snapraid.post("/execute", async (c) => {
  const { command, configPath: relativePath, args = [] } = await c.req.json();

  if (!command || !relativePath) {
    return c.json({ error: "Missing command or configPath" }, 400);
  }

  if (getEngine().currentJob()) {
    return c.json({ error: msg("server_error_job_running") }, 409);
  }

  startJob(command, resolveFromBase(relativePath), args);
  return c.json({ success: true, message: "Command started" });
});

// POST /api/snapraid/remove-data-disk - Remove a data disk the way the SnapRAID FAQ describes:
// point it to an empty directory, `sync -E`, then drop it from the config once the sync succeeded
snapraid.post("/remove-data-disk", async (c) => {
  const { configPath: relativePath, diskName } = await c.req.json();

  if (!relativePath || !diskName) {
    return c.json({ error: "Missing configPath or diskName" }, 400);
  }

  if (getEngine().currentJob()) {
    return c.json({ error: msg("server_error_job_running") }, 409);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const { config, emptyDir } = prepareDataDiskRemoval(await Deno.readTextFile(configPath), diskName);
    await ensureEmptyDir(emptyDir);
    await Deno.writeTextFile(configPath, config);

    // A failed or aborted sync leaves the disk pending, the wizard can retry it
    startJob("sync", configPath, ["-E"], async ({ output }) => {
      if (output.exitCode !== 0 || output.aborted) return;
      const current = await Deno.readTextFile(configPath);
      await Deno.writeTextFile(configPath, finalizeDataDiskRemoval(current, diskName));
      await Deno.remove(emptyDir).catch(() => {});
    });

    return c.json({ success: true, config: await parseSnapRaidConfig(configPath) });
  } catch (error) {
    if (error instanceof DiskRemovalError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/history - Get command history
snapraid.get("/history", (c) => {
  return c.json(commandHistory.map((outcome) => outcome.output));
});

// GET /api/snapraid/status - Get parsed status from last status command or execute new one
snapraid.get("/status", async (c) => {
  const relativePath = c.req.query("path");
  
  // If no config path provided, try to get from last status in history
  if (!relativePath) {
    const lastStatus = commandHistory.find((outcome) => outcome.report.command === "status");
    
    if (!lastStatus) {
      return c.json({ error: "No status command found in history. Please provide 'path' query parameter to execute status." }, 400);
    }

    const parsedStatus = parseStatusOutput(lastStatus.report.log, lastStatus.output.output);
    return c.json({
      status: parsedStatus,
      timestamp: lastStatus.output.timestamp,
      exitCode: lastStatus.output.exitCode,
    });
  }

  try {
    const configPath = resolveFromBase(relativePath);
    const { status, exitCode } = await getEngine().readStatus(configPath);
    if (exitCode === 0) await recordUsage(configPath, status);

    return c.json({
      status,
      timestamp: new Date().toISOString(),
      exitCode,
    });
  } catch (error) {
    // A running job or another SnapRAID process holds the lock
    if (error instanceof EngineBusyError) {
      const key = error.reason === "job" ? "server_error_snapraid_busy" : "server_error_snapraid_in_use";
      return c.json({ error: msg(key), busy: true }, 409);
    }
    return c.json({ error: String(error) }, 500);
  }
});


// GET /api/snapraid/usage-history - Daily usage of the array, recorded on each status read
snapraid.get("/usage-history", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    return c.json(await getUsageHistory(resolveFromBase(relativePath)));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/validate - Validate SnapRAID config
snapraid.post("/validate", async (c) => {
  const { configPath: relativePath } = await c.req.json();

  if (!relativePath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  try {
    const configPath = resolveFromBase(relativePath);
    // Run snapraid status to validate the config
    // We only care about whether it succeeds or fails, not the actual status output
    const command = snapraidCommand(["-c", configPath, "status"]);

    const { code, stderr } = await command.output();
    const errorOutput = new TextDecoder().decode(stderr);

    return c.json({
      valid: code === 0,
      exitCode: code,
      output: code === 0 ? "Configuration is valid!" : errorOutput,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { snapraid as snapraidRoutes };
