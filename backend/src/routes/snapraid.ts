import { Hono } from "hono";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { createSnapRaidRunner, type SnapRaidRunner } from "../snapraid-runner.ts";
import { join } from "@std/path";
import type { LogManager } from "../log-manager.ts";
import type { CommandOutput } from "@shared/types.ts";
import { BASE_PATH } from "../config.ts";
import {diskManagementRoutes} from "./disk-management.ts";
import {configOperationsRoutes} from "./config-operations.ts";
import {hardwareRoutes} from "./hardware.ts";
import { setReportsRunner, reportsRoutes } from "./reports.ts";
import { parseStatusOutput } from "../parsers/status-parser.ts";

const snapraid = new Hono();

const runner = createSnapRaidRunner();
const commandHistory: CommandOutput[] = [];
const MAX_HISTORY = 50;

// Broadcast function will be injected
const state = {
  broadcastFn: (() => {}) as (message: unknown) => void,
};

export const setBroadcast = (fn: (message: unknown) => void): void => {
  state.broadcastFn = fn;
};

export const setRunnerLogManager = (logManager: LogManager): void => {
  runner.setLogManager(logManager);
};

export const getRunner = (): SnapRaidRunner => {
  return runner;
};

// Initialize runner for reports module
setReportsRunner(runner);

// Mount sub-routes
snapraid.route("/", diskManagementRoutes);
snapraid.route("/", configOperationsRoutes);
snapraid.route("/", hardwareRoutes);
snapraid.route("/", reportsRoutes);

// GET /api/snapraid/parse - Parse SnapRAID config
snapraid.get("/parse", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = join(BASE_PATH, relativePath);

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

// POST /api/snapraid/execute - Execute SnapRAID command
snapraid.post("/execute", async (c) => {
  const { command, configPath: relativePath, args = [] } = await c.req.json();

  if (!command || !relativePath) {
    return c.json({ error: "Missing command or configPath" }, 400);
  }

  const configPath = join(BASE_PATH, relativePath);

  // Execute command and stream output via WebSocket
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
        args
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
        exitCode: result.exitCode,
        timestamp: result.timestamp,
      });

      // Parse status if it was a status or diff command
      if (command === "status" || command === "diff") {
        const status = parseStatusOutput(result.output);
        state.broadcastFn({
          type: "status",
          status,
        });
      }
    } catch (error) {
      state.broadcastFn({
        type: "error",
        command,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  })();

  return c.json({ success: true, message: "Command started" });
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
    const lastStatus = commandHistory.find(cmd => cmd.command === 'status');
    
    if (!lastStatus) {
      return c.json({ error: "No status command found in history. Please provide 'path' query parameter to execute status." }, 400);
    }

    const parsedStatus = parseStatusOutput(lastStatus.output);
    return c.json({
      status: parsedStatus,
      timestamp: lastStatus.timestamp,
      exitCode: lastStatus.exitCode,
    });
  }

  // Execute new status command
  try {
    const configPath = join(BASE_PATH, relativePath);
    const cmd = new Deno.Command("snapraid", {
      args: ["-c", configPath, "status"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(code === 0 ? stdout : stderr);
    const parsedStatus = parseStatusOutput(output);
    
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
    const configPath = join(BASE_PATH, relativePath);
    // Run snapraid status to validate the config
    // We only care about whether it succeeds or fails, not the actual status output
    const command = new Deno.Command("snapraid", {
      args: ["-c", configPath, "status"],
      stdout: "piped",
      stderr: "piped",
    });

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
