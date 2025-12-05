import { Hono } from "hono";
import { ConfigParser } from "../config-parser.ts";
import { SnapRaidRunner } from "../snapraid-runner.ts";
import type { CommandOutput } from "../types.ts";

const snapraid = new Hono();

const runner = new SnapRaidRunner();
const commandHistory: CommandOutput[] = [];
const MAX_HISTORY = 50;

// Broadcast function will be injected
let broadcastFn: (message: unknown) => void = () => {};

export function setBroadcast(fn: (message: unknown) => void) {
  broadcastFn = fn;
}

// GET /api/snapraid/parse - Parse SnapRAID config
snapraid.get("/parse", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json(parsed);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/execute - Execute SnapRAID command
snapraid.post("/execute", async (c) => {
  const { command, configPath, args = [] } = await c.req.json();

  if (!command || !configPath) {
    return c.json({ error: "Missing command or configPath" }, 400);
  }

  // Execute command and stream output via WebSocket
  runner
    .executeCommand(
      command,
      configPath,
      (chunk) => {
        broadcastFn({
          type: "output",
          command,
          chunk,
          timestamp: new Date().toISOString(),
        });
      },
      args
    )
    .then((result) => {
      // Add to history
      commandHistory.unshift(result);
      if (commandHistory.length > MAX_HISTORY) {
        commandHistory.pop();
      }

      // Send completion message
      broadcastFn({
        type: "complete",
        command,
        exitCode: result.exitCode,
        timestamp: result.timestamp.toISOString(),
      });

      // Parse status if it was a status command
      if (command === "status") {
        const status = SnapRaidRunner.parseStatusOutput(result.output);
        broadcastFn({
          type: "status",
          status,
        });
      }
    })
    .catch((error) => {
      broadcastFn({
        type: "error",
        command,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    });

  return c.json({ success: true, message: "Command started" });
});

// GET /api/history - Get command history
snapraid.get("/history", (c) => {
  return c.json(commandHistory);
});

// POST /api/snapraid/validate - Validate SnapRAID config
snapraid.post("/validate", async (c) => {
  const { configPath } = await c.req.json();

  if (!configPath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  try {
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

export default snapraid;
