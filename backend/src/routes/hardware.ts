import { Hono } from "hono";
import { resolveFromBase } from "../config.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { getDataDiskUsage, getParityUsage } from "../parity-usage.ts";
import { withCrcBaseline } from "../smart-baseline.ts";
import { getSmartHistory, recordSmartHistory } from "../smart-history.ts";
import { EngineCommandError, EngineUnsupportedError, getEngine } from "../engine/engine.ts";

const hardware = new Hono();

// GET /api/snapraid/smart - Get SMART report for all disks
hardware.get("/smart", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const reading = await getEngine().readSmart(configPath);
    const disks = await withCrcBaseline(configPath, reading.disks);
    await recordSmartHistory(configPath, disks);

    // SnapRAID exits with an error when a disk is FAIL or PREFAIL, the report is complete though
    if (reading.exitCode !== 0 && disks.length === 0) {
      return c.json({
        error: reading.error || "Failed to get SMART report",
        exitCode: reading.exitCode,
      }, 500);
    }

    return c.json({
      disks,
      arrayFailureProbability: reading.arrayFailureProbability,
      timestamp: new Date().toISOString(),
      rawOutput: reading.rawOutput,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/smart-history - Daily SMART values of the disks, recorded on each read
hardware.get("/smart-history", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    return c.json(await getSmartHistory(resolveFromBase(relativePath)));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/probe - Get power status of all disks
hardware.get("/probe", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    return c.json(await getEngine().readPowerStates(configPath));
  } catch (error) {
    if (error instanceof EngineUnsupportedError) {
      return c.json({
        error: error.message,
        unsupported: true,
        exitCode: error.exitCode,
        rawOutput: error.rawOutput,
      }, 400);
    }
    if (error instanceof EngineCommandError) {
      return c.json({ error: error.message, exitCode: error.exitCode, rawOutput: error.rawOutput }, 500);
    }
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/parity-usage - Size and free space of the parity disks
hardware.get("/parity-usage", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const config = await parseSnapRaidConfig(configPath);
    return c.json(await getParityUsage(config));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/data-disk-usage - Size and free space of the data disks
hardware.get("/data-disk-usage", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const config = await parseSnapRaidConfig(configPath);
    return c.json(await getDataDiskUsage(config));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { hardware as hardwareRoutes };
