import { Hono } from "hono";
import { join } from "@std/path";
import { parseProbeOutput } from "../parsers/probe-parser.ts";
import { parseSmartOutput } from "../parsers/smart-parser.ts";
import { snapraidCommand, resolveFromBase } from "../config.ts";
import { STRUCTURED_LOG_ARGS, splitStructuredOutput } from "../parsers/structured-log.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { getParityUsage } from "../parity-usage.ts";

const hardware = new Hono();

// GET /api/snapraid/smart - Get SMART report for all disks
hardware.get("/smart", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const command = snapraidCommand(["-c", configPath, ...STRUCTURED_LOG_ARGS, "smart"]);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const { log, text: errorOutput } = splitStructuredOutput(new TextDecoder().decode(stderr));

    if (code !== 0) {
      return c.json({ 
        error: errorOutput || "Failed to get SMART report",
        exitCode: code 
      }, 500);
    }

    // Parse SMART output
    const disks = parseSmartOutput(log);

    return c.json({
      disks,
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
    const command = snapraidCommand(["-c", configPath, ...STRUCTURED_LOG_ARGS, "probe"]);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const { log, text: errorOutput } = splitStructuredOutput(new TextDecoder().decode(stderr));

    // Check if probe is unsupported - can be in stdout, stderr, or both
    // SnapRAID sometimes returns exit code 0 even when probe fails!
    const combinedOutput = output + "\n" + errorOutput;
    if (combinedOutput.includes("unsupported") || combinedOutput.includes("Probe is unsupported")) {
      return c.json({ 
        error: "Probe command is not supported on this platform. This is common with NVMe drives or certain disk controllers.",
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

// POST /api/snapraid/up - Spin up all disks
hardware.post("/up", async (c) => {
  const { configPath: relativePath, disks } = await c.req.json();

  if (!relativePath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const args = ["-c", configPath];
    
    // Add disk filters if specific disks are requested
    if (disks && Array.isArray(disks) && disks.length > 0) {
      for (const disk of disks) {
        args.push("-d", disk);
      }
    }
    
    args.push("up");

    const command = snapraidCommand(args);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    if (code !== 0) {
      return c.json({ 
        error: errorOutput || "Failed to spin up disks",
        exitCode: code,
        output 
      }, 500);
    }

    return c.json({
      success: true,
      message: disks && disks.length > 0 
        ? `Spun up disks: ${disks.join(', ')}` 
        : "Spun up all disks",
      output,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/down - Spin down all disks
hardware.post("/down", async (c) => {
  const { configPath: relativePath, disks } = await c.req.json();

  if (!relativePath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const args = ["-c", configPath];
    
    // Add disk filters if specific disks are requested
    if (disks && Array.isArray(disks) && disks.length > 0) {
      for (const disk of disks) {
        args.push("-d", disk);
      }
    }
    
    args.push("down");

    const command = snapraidCommand(args);

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    if (code !== 0) {
      return c.json({ 
        error: errorOutput || "Failed to spin down disks",
        exitCode: code,
        output 
      }, 500);
    }

    return c.json({
      success: true,
      message: disks && disks.length > 0 
        ? `Spun down disks: ${disks.join(', ')}` 
        : "Spun down all disks",
      output,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { hardware as hardwareRoutes };
