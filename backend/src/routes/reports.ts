import { Hono } from "hono";
import type { SnapRaidRunner } from "../snapraid-runner.ts";

const reports = new Hono();

// Runner will be injected
let runner: SnapRaidRunner;

export const setReportsRunner = (snapraidRunner: SnapRaidRunner): void => {
  runner = snapraidRunner;
};

// GET /api/snapraid/devices - Get device information
reports.get("/devices", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const result = await runner.runDevices(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/list - Get file list
reports.get("/list", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const result = await runner.runList(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/check - Get check report
reports.get("/check", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const result = await runner.runCheck(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/diff - Get diff report
reports.get("/diff", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const result = await runner.runDiff(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { reports as reportsRoutes };
export default reports;
