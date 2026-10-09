import { Hono } from "hono";
import type { SnapRaidRunner } from "../snapraid-runner.ts";
import { resolveFromBase } from "../config.ts";
import { getEngine } from "../engine/engine.ts";

const reports = new Hono();

// Runner will be injected
let runner: SnapRaidRunner;

export const setReportsRunner = (snapraidRunner: SnapRaidRunner): void => {
  runner = snapraidRunner;
};

// GET /api/snapraid/devices - Get device information
reports.get("/devices", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runDevices(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/list - Get file list
reports.get("/list", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runList(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/dup - Duplicate files, from the hashes in the content file
reports.get("/dup", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runDup(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/diff - Get diff report
reports.get("/diff", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await getEngine().readDiff(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { reports as reportsRoutes };
