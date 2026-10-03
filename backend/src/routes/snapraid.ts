import { Hono } from "hono";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { createSnapRaidRunner, type SnapRaidRunner } from "../snapraid-runner.ts";
import type { LogManager } from "../log-manager.ts";
import type { CommandOutput, SnapRaidCommand } from "@shared/types.ts";
import { snapraidCommand, resolveFromBase } from "../config.ts";
import {diskManagementRoutes} from "./disk-management.ts";
import { DiskRemovalError, ensureEmptyDir, finalizeDataDiskRemoval, prepareDataDiskRemoval } from "../disk-removal.ts";
import {configOperationsRoutes} from "./config-operations.ts";
import {hardwareRoutes} from "./hardware.ts";
import { setReportsRunner, reportsRoutes } from "./reports.ts";
import { parseStatusOutput } from "../parsers/status-parser.ts";
import { parseCheckOutput } from "../parsers/check-parser.ts";
import { isLockedOutput, STRUCTURED_LOG_ARGS, splitStructuredOutput } from "../parsers/structured-log.ts";
import { createDiskReplacementRoutes } from "./disk-replacement.ts";
import { readRunReport } from "../run-report.ts";
import { notifyManualRun } from "../notification-events.ts";
import { msg } from "@shared/i18n.ts";

const snapraid = new Hono();

const runner = createSnapRaidRunner();
const commandHistory: CommandOutput[] = [];
const MAX_HISTORY = 50;

// Broadcast function will be injected
const state = {
  broadcastFn: (() => {}) as (message: unknown) => void,
  logManager: null as LogManager | null,
};

export const setBroadcast = (fn: (message: unknown) => void): void => {
  state.broadcastFn = fn;
};

export const setRunnerLogManager = (logManager: LogManager): void => {
  runner.setLogManager(logManager);
  state.logManager = logManager;
};

export const getRunner = (): SnapRaidRunner => {
  return runner;
};

/**
 * Read the structured log SnapRAID wrote for an executed command
 */
const readStructuredLog = async (result: CommandOutput): Promise<string> => {
  if (!result.logPath) return "";
  try {
    return await Deno.readTextFile(result.logPath);
  } catch {
    return "";
  }
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
  isBusy: () => !!runner.getCurrentJob(),
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
  const currentJob = runner.getCurrentJob();
  return c.json(currentJob);
});

// GET /api/snapraid/last-job - Outcome of the last finished job, for clients that missed its completion
snapraid.get("/last-job", (c) => {
  return c.json(runner.getLastJob());
});

// POST /api/snapraid/abort - Abort the running job
snapraid.post("/abort", (c) => {
  const currentJob = runner.getCurrentJob();
  if (!currentJob) {
    return c.json({ error: msg("server_error_no_job") }, 404);
  }

  const aborted = runner.abortCommand(currentJob.processId);
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
  const job = runner.getCurrentJob();
  const runningLog = job?.configPath === configPath ? job.logFile : undefined;

  try {
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
  afterRun?: (result: CommandOutput) => Promise<void>,
): void => {
  (async () => {
    try {
      const result = await runner.executeCommand(
        command,
        configPath,
        (chunk) => {
          state.broadcastFn({
            type: "output",
            command,
            chunk,
            timestamp: new Date().toISOString(),
          });
        },
        args,
        afterRun
      );

      // Add to history
      commandHistory.unshift(result);
      if (commandHistory.length > MAX_HISTORY) {
        commandHistory.pop();
      }

      // Send completion message
      state.broadcastFn({
        type: "complete",
        command,
        processId: runner.getLastJob()?.processId,
        forceOption: runner.getLastJob()?.forceOption,
        exitCode: result.exitCode,
        aborted: result.aborted,
        timestamp: result.timestamp,
      });

      if (NOTIFIED_MANUAL_COMMANDS.includes(command)) {
        await notifyManualRun(configPath, await readRunReport(command, result));
      }

      // Parse status if it was a status or diff command
      if (command === "status" || command === "diff") {
        const status = parseStatusOutput(await readStructuredLog(result), result.output);
        state.broadcastFn({
          type: "status",
          status,
        });
      }
    } catch (error) {
      state.broadcastFn({
        type: "error",
        command,
        processId: runner.getLastJob()?.processId,
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

  if (runner.getCurrentJob()) {
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

  if (runner.getCurrentJob()) {
    return c.json({ error: msg("server_error_job_running") }, 409);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const { config, emptyDir } = prepareDataDiskRemoval(await Deno.readTextFile(configPath), diskName);
    await ensureEmptyDir(emptyDir);
    await Deno.writeTextFile(configPath, config);

    // A failed or aborted sync leaves the disk pending, the wizard can retry it
    startJob("sync", configPath, ["-E"], async (result) => {
      if (result.exitCode !== 0 || result.aborted) return;
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
  return c.json(commandHistory);
});

// GET /api/snapraid/status - Get parsed status from last status command or execute new one
snapraid.get("/status", async (c) => {
  const relativePath = c.req.query("path");
  
  // If no config path provided, try to get from last status in history
  if (!relativePath) {
    const lastStatus = commandHistory.find(cmd => cmd.command.startsWith('snapraid status '));
    
    if (!lastStatus) {
      return c.json({ error: "No status command found in history. Please provide 'path' query parameter to execute status." }, 400);
    }

    const parsedStatus = parseStatusOutput(await readStructuredLog(lastStatus), lastStatus.output);
    return c.json({
      status: parsedStatus,
      timestamp: lastStatus.timestamp,
      exitCode: lastStatus.exitCode,
    });
  }

  // A running job holds SnapRAID's lock, status would only fail with a fatal error
  if (runner.getCurrentJob()) {
    return c.json({ error: msg("server_error_snapraid_busy"), busy: true }, 409);
  }

  // Execute new status command
  try {
    const configPath = resolveFromBase(relativePath);
    const cmd = snapraidCommand(["-c", configPath, ...STRUCTURED_LOG_ARGS, "status"]);

    const { code, stdout, stderr } = await cmd.output();
    const { log, text } = splitStructuredOutput(new TextDecoder().decode(stderr));
    if (isLockedOutput(log)) {
      return c.json({ error: msg("server_error_snapraid_in_use"), busy: true }, 409);
    }
    const parsedStatus = parseStatusOutput(log, code === 0 ? new TextDecoder().decode(stdout) : text);
    
    return c.json({
      status: parsedStatus,
      timestamp: new Date().toISOString(),
      exitCode: code,
    });
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
