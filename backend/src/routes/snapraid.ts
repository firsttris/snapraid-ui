import { Hono } from "hono";
import { ConfigParser } from "../config-parser.ts";
import { SnapRaidRunner } from "../snapraid-runner.ts";
import type { LogManager } from "../log-manager.ts";
import type { CommandOutput } from "@shared/types.ts";

const snapraid = new Hono();

const runner = new SnapRaidRunner();
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

// GET /api/snapraid/current-job - Get current running job
snapraid.get("/current-job", (c) => {
  const currentJob = runner.getCurrentJob();
  return c.json(currentJob);
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
        state.broadcastFn({
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
      state.broadcastFn({
        type: "complete",
        command,
        exitCode: result.exitCode,
        timestamp: result.timestamp,
      });

      // Parse status if it was a status or diff command
      if (command === "status" || command === "diff") {
        const status = SnapRaidRunner.parseStatusOutput(result.output);
        state.broadcastFn({
          type: "status",
          status,
        });
      }
    })
    .catch((error) => {
      state.broadcastFn({
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

// POST /api/snapraid/add-data-disk - Add a data disk to SnapRAID config
snapraid.post("/add-data-disk", async (c) => {
  const { configPath, diskName, diskPath } = await c.req.json();

  if (!configPath || !diskName || !diskPath) {
    return c.json({ error: "Missing configPath, diskName, or diskPath" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    
    // Check if disk name already exists
    const lines = content.split("\n");
    const diskExists = lines.some(line => line.trim().startsWith(`data ${diskName} `));

    if (diskExists) {
      return c.json({ error: `Disk name '${diskName}' already exists` }, 400);
    }

    // Find position to insert functionally
    const findInsertIndex = (lns: string[]): number => {
      const lastDataContentIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .reverse()
        .find(({ line }) => line.startsWith("data ") || line.startsWith("content "))
        ?.index;
      
      const firstExcludeIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .find(({ line }) => line.startsWith("exclude "))
        ?.index;
      
      if (lastDataContentIndex !== undefined) return lastDataContentIndex + 1;
      if (firstExcludeIndex !== undefined) return firstExcludeIndex;
      
      const lastParityIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .reverse()
        .find(({ line }) => line.startsWith("parity "))
        ?.index;
      
      return lastParityIndex !== undefined ? lastParityIndex + 1 : lns.length;
    };

    const insertIndex = findInsertIndex(lines);

    // Insert data line followed immediately by content line, then empty line
    const newDataLine = `data ${diskName} ${diskPath}`;
    const contentPath = `${diskPath}/.snapraid.content`;
    const newContentLine = `content ${contentPath}`;
    
    const updatedLines = [
      ...lines.slice(0, insertIndex),
      "",
      newDataLine,
      newContentLine,
      ...lines.slice(insertIndex),
    ];

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/add-parity-disk - Add a parity disk to SnapRAID config
snapraid.post("/add-parity-disk", async (c) => {
  const { configPath, parityPath } = await c.req.json();

  if (!configPath || !parityPath) {
    return c.json({ error: "Missing configPath or parityPath" }, 400);
  }

  // Validate that parityPath ends with .parity
  if (!parityPath.endsWith(".parity")) {
    return c.json({ error: "Parity file path must end with .parity" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Find the last parity line or a good position to insert
    const findParityInsertIndex = (lns: string[]): number => {
      const lastParityIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .reverse()
        .find(({ line }) => line.startsWith("parity "))
        ?.index;
      
      if (lastParityIndex !== undefined) return lastParityIndex + 1;
      
      const firstNonCommentIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .find(({ line }) => line !== "" && !line.startsWith("#"))
        ?.index;
      
      return firstNonCommentIndex ?? 0;
    };

    const insertIndex = findParityInsertIndex(lines);
    const newLine = `parity ${parityPath}`;
    
    const updatedLines = [
      ...lines.slice(0, insertIndex),
      newLine,
      ...lines.slice(insertIndex),
    ];

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/remove-disk - Remove a disk from SnapRAID config
snapraid.post("/remove-disk", async (c) => {
  const { configPath, diskName, diskType } = await c.req.json();

  if (!configPath || (!diskName && diskType !== "parity")) {
    return c.json({ error: "Missing required parameters" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    const updatedLines = (() => {
      if (diskType === "data") {
        // Find the data disk path to identify associated content file
        const diskPath = lines
          .map(line => line.trim())
          .find(line => line.startsWith(`data ${diskName} `))
          ?.substring(`data ${diskName} `.length)
          .trim();

        // Remove the data line and associated content file
        const contentPath = diskPath ? `${diskPath}/.snapraid.content` : null;
        return lines.filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith(`data ${diskName} `) &&
                 !(contentPath && trimmed.startsWith(`content ${contentPath}`));
        });
      }
      
      if (diskType === "parity") {
        // Remove the first parity line found
        const parityIndex = lines.findIndex(line => line.trim().startsWith("parity "));
        return parityIndex !== -1
          ? [...lines.slice(0, parityIndex), ...lines.slice(parityIndex + 1)]
          : lines;
      }
      
      return lines;
    })();

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/add-exclude - Add an exclude pattern to SnapRAID config
snapraid.post("/add-exclude", async (c) => {
  const { configPath, pattern } = await c.req.json();

  if (!configPath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Check if pattern already exists
    const patternExists = lines.some(line => line.trim() === `exclude ${pattern}`);

    if (patternExists) {
      return c.json({ error: `Pattern '${pattern}' already exists` }, 400);
    }

    // Find the last exclude line or a good position to insert
    const findExcludeInsertIndex = (lns: string[]): number => {
      const lastExcludeIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .reverse()
        .find(({ line }) => line.startsWith("exclude "))
        ?.index;
      
      if (lastExcludeIndex !== undefined) return lastExcludeIndex + 1;
      
      const lastDataIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .reverse()
        .find(({ line }) => line.startsWith("data "))
        ?.index;
      
      return lastDataIndex !== undefined ? lastDataIndex + 1 : lns.length;
    };

    const insertIndex = findExcludeInsertIndex(lines);
    const newLine = `exclude ${pattern}`;
    
    const updatedLines = [
      ...lines.slice(0, insertIndex),
      newLine,
      ...lines.slice(insertIndex),
    ];

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/remove-exclude - Remove an exclude pattern from SnapRAID config
snapraid.post("/remove-exclude", async (c) => {
  const { configPath, pattern } = await c.req.json();

  if (!configPath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Remove the exclude line
    const updatedLines = lines.filter(line => line.trim() !== `exclude ${pattern}`);

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/set-pool - Set pool directory in SnapRAID config
snapraid.post("/set-pool", async (c) => {
  const { configPath, poolPath } = await c.req.json();

  if (!configPath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Remove existing pool line if present
    let filteredLines = lines.filter(line => !line.trim().startsWith("pool "));

    // If poolPath is provided (not undefined/null/empty), add the pool line
    if (poolPath) {
      // Find position to insert (after exclude or data lines, before end)
      const findPoolInsertIndex = (lns: string[]): number => {
        const lastExcludeIndex = lns
          .map((line, i) => ({ line: line.trim(), index: i }))
          .reverse()
          .find(({ line }) => line.startsWith("exclude "))
          ?.index;
        
        if (lastExcludeIndex !== undefined) return lastExcludeIndex + 1;
        
        const lastDataIndex = lns
          .map((line, i) => ({ line: line.trim(), index: i }))
          .reverse()
          .find(({ line }) => line.startsWith("data "))
          ?.index;
        
        return lastDataIndex !== undefined ? lastDataIndex + 1 : lns.length;
      };

      const insertIndex = findPoolInsertIndex(filteredLines);
      const newLine = `pool ${poolPath}`;
      
      filteredLines = [
        ...filteredLines.slice(0, insertIndex),
        "",
        newLine,
        ...filteredLines.slice(insertIndex),
      ];
    }

    // Write back to file
    await Deno.writeTextFile(configPath, filteredLines.join("\n"));

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/smart - Get SMART report for all disks
snapraid.get("/smart", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const command = new Deno.Command("snapraid", {
      args: ["-c", configPath, "smart"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    if (code !== 0) {
      return c.json({ 
        error: errorOutput || "Failed to get SMART report",
        exitCode: code 
      }, 500);
    }

    // Parse SMART output
    const disks = parseSmartOutput(output);

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
snapraid.get("/probe", async (c) => {
  const configPath = c.req.query("path");
  
  if (!configPath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const command = new Deno.Command("snapraid", {
      args: ["-c", configPath, "probe"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

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
    const disks = parseProbeOutput(output);

    return c.json({
      disks,
      timestamp: new Date().toISOString(),
      rawOutput: output,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/up - Spin up all disks
snapraid.post("/up", async (c) => {
  const { configPath, disks } = await c.req.json();

  if (!configPath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  try {
    const args = ["-c", configPath];
    
    // Add disk filters if specific disks are requested
    if (disks && Array.isArray(disks) && disks.length > 0) {
      for (const disk of disks) {
        args.push("-d", disk);
      }
    }
    
    args.push("up");

    const command = new Deno.Command("snapraid", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

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
snapraid.post("/down", async (c) => {
  const { configPath, disks } = await c.req.json();

  if (!configPath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  try {
    const args = ["-c", configPath];
    
    // Add disk filters if specific disks are requested
    if (disks && Array.isArray(disks) && disks.length > 0) {
      for (const disk of disks) {
        args.push("-d", disk);
      }
    }
    
    args.push("down");

    const command = new Deno.Command("snapraid", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

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

// Helper function to parse SMART output
function parseSmartOutput(output: string) {
  const disks: Array<{
    name: string;
    device: string;
    status: string;
    temperature?: number;
    powerOnHours?: number;
    failureProbability?: number;
    model?: string;
    serial?: string;
    size?: string;
  }> = [];

  const lines = output.split('\n');
  let currentDisk: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match disk header lines like "d1 /dev/sda"
    const diskMatch = trimmed.match(/^(\S+)\s+(.+)$/);
    if (diskMatch && !trimmed.includes(':') && currentDisk === null) {
      currentDisk = {
        name: diskMatch[1],
        device: diskMatch[2],
        status: 'UNKNOWN',
      };
      continue;
    }

    // Status indicators
    if (trimmed.includes('FAIL')) {
      if (currentDisk) currentDisk.status = 'FAIL';
    } else if (trimmed.includes('PREFAIL')) {
      if (currentDisk) currentDisk.status = 'PREFAIL';
    } else if (trimmed.includes('LOGFAIL')) {
      if (currentDisk) currentDisk.status = 'LOGFAIL';
    } else if (trimmed.includes('LOGERR')) {
      if (currentDisk) currentDisk.status = 'LOGERR';
    } else if (trimmed.includes('SELFERR')) {
      if (currentDisk) currentDisk.status = 'SELFERR';
    } else if (currentDisk && currentDisk.status === 'UNKNOWN' && trimmed.includes('/dev/')) {
      currentDisk.status = 'OK';
    }

    // Temperature
    const tempMatch = trimmed.match(/Temperature.*?(\d+)\s*°?C/i);
    if (tempMatch && currentDisk) {
      currentDisk.temperature = parseInt(tempMatch[1]);
    }

    // Power on hours
    const hoursMatch = trimmed.match(/Power[_\s]On[_\s]Hours.*?(\d+)/i);
    if (hoursMatch && currentDisk) {
      currentDisk.powerOnHours = parseInt(hoursMatch[1]);
    }

    // Failure probability (if present in verbose mode)
    const probMatch = trimmed.match(/probability.*?(\d+\.?\d*)%/i);
    if (probMatch && currentDisk) {
      currentDisk.failureProbability = parseFloat(probMatch[1]);
    }

    // Model
    const modelMatch = trimmed.match(/Device Model:\s*(.+)/i);
    if (modelMatch && currentDisk) {
      currentDisk.model = modelMatch[1].trim();
    }

    // Serial
    const serialMatch = trimmed.match(/Serial Number:\s*(.+)/i);
    if (serialMatch && currentDisk) {
      currentDisk.serial = serialMatch[1].trim();
    }

    // Size
    const sizeMatch = trimmed.match(/User Capacity:\s*(.+)/i);
    if (sizeMatch && currentDisk) {
      currentDisk.size = sizeMatch[1].trim();
    }

    // Empty line or new disk section - save current disk
    if (trimmed === '' && currentDisk !== null) {
      disks.push(currentDisk);
      currentDisk = null;
    }
  }

  // Add last disk if exists
  if (currentDisk !== null) {
    disks.push(currentDisk);
  }

  return disks;
}

// Helper function to parse probe output
function parseProbeOutput(output: string) {
  const disks: Array<{
    name: string;
    device: string;
    status: string;
  }> = [];

  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match lines like "d1 /dev/sda Standby" or "parity /dev/sdb Active"
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+(Standby|Active|Idle)/i);
    if (match) {
      disks.push({
        name: match[1],
        device: match[2],
        status: match[3],
      });
    }
  }

  return disks;
}

// GET /api/snapraid/devices - Get device information
snapraid.get("/devices", async (c) => {
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
snapraid.get("/list", async (c) => {
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
snapraid.get("/check", async (c) => {
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

export default snapraid;
