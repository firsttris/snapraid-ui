import { Hono } from "hono";
import { parseProbeOutput } from "../parsers/probe-parser.ts";
import { parseSmartArrayFailure, parseSmartOutput } from "../parsers/smart-parser.ts";
import { snapraidCommand, resolveFromBase } from "../config.ts";
import { STRUCTURED_LOG_ARGS, splitStructuredOutput } from "../parsers/structured-log.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { getDataDiskUsage, getParityUsage } from "../parity-usage.ts";
import { DEMO_MODE, demoProbeLog, demoSmartLog } from "../demo.ts";
import { msg } from "@shared/i18n.ts";

const hardware = new Hono();

// GET /api/snapraid/smart - Get SMART report for all disks
hardware.get("/smart", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    if (DEMO_MODE) {
      const log = await demoSmartLog(configPath);
      return c.json({
        disks: parseSmartOutput(log),
        arrayFailureProbability: parseSmartArrayFailure(log),
        timestamp: new Date().toISOString(),
        rawOutput: log,
      });
    }

    const command = snapraidCommand(["-c", configPath, ...STRUCTURED_LOG_ARGS, "smart"]);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const { log, text: errorOutput } = splitStructuredOutput(new TextDecoder().decode(stderr));

    const disks = parseSmartOutput(log);

    // SnapRAID exits with an error when a disk is FAIL or PREFAIL, the report is complete though
    if (code !== 0 && disks.length === 0) {
      return c.json({ 
        error: errorOutput || "Failed to get SMART report",
        exitCode: code 
      }, 500);
    }

    return c.json({
      disks,
      arrayFailureProbability: parseSmartArrayFailure(log),
      timestamp: new Date().toISOString(),
      rawOutput: output,
    });
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
    if (DEMO_MODE) {
      const log = await demoProbeLog(configPath);
      return c.json({ disks: parseProbeOutput(log), timestamp: new Date().toISOString(), rawOutput: log });
    }

    const command = snapraidCommand(["-c", configPath, ...STRUCTURED_LOG_ARGS, "probe"]);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const { log, text: errorOutput } = splitStructuredOutput(new TextDecoder().decode(stderr));

    // Check if probe is unsupported - can be in stdout, stderr, or both
    // SnapRAID sometimes returns exit code 0 even when probe fails!
    const combinedOutput = output + "\n" + errorOutput;
    if (combinedOutput.includes("unsupported") || combinedOutput.includes("Probe is unsupported")) {
      return c.json({ 
        error: msg("server_error_probe_unsupported"),
        unsupported: true,
        exitCode: code,
        rawOutput: combinedOutput.trim()
      }, 400);
    }

    if (code !== 0) {
      return c.json({ 
        error: errorOutput || "Failed to probe disk status",
        exitCode: code,
        rawOutput: combinedOutput.trim()
      }, 500);
    }

    // Parse probe output
    const disks = parseProbeOutput(log);

    return c.json({
      disks,
      timestamp: new Date().toISOString(),
      rawOutput: output,
    });
  } catch (error) {
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
