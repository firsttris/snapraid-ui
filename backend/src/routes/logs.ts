import { Hono } from "hono";
import { LogManager } from "../log-manager.ts";
import type { AppConfig } from "../types.ts";

const logs = new Hono();

// Will be injected from main
let logManager: LogManager | null = null;
let appConfig: AppConfig | null = null;

export function setLogManager(manager: LogManager, config: AppConfig) {
  logManager = manager;
  appConfig = config;
}

// GET /api/logs - List all log files
logs.get("/", async (c) => {
  if (!logManager) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  try {
    const logFiles = await logManager.listLogs();
    return c.json(logFiles);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/logs/:filename - Get log file content
logs.get("/:filename", async (c) => {
  if (!logManager) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  const filename = c.req.param("filename");

  try {
    const content = await logManager.readLog(filename);
    return c.text(content);
  } catch (error) {
    return c.json({ error: String(error) }, 404);
  }
});

// DELETE /api/logs/:filename - Delete log file
logs.delete("/:filename", async (c) => {
  if (!logManager) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  const filename = c.req.param("filename");

  try {
    await logManager.deleteLog(filename);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/logs/rotate - Manually trigger log rotation
logs.post("/rotate", async (c) => {
  if (!logManager || !appConfig) {
    return c.json({ error: "Log manager not initialized" }, 500);
  }

  try {
    const deleted = await logManager.rotateLogs(
      appConfig.logs.maxFiles,
      appConfig.logs.maxAge
    );
    return c.json({ success: true, deleted });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default logs;
