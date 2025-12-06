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

// POST /api/snapraid/add-data-disk - Add a data disk to SnapRAID config
snapraid.post("/add-data-disk", async (c) => {
  const { configPath, diskName, diskPath } = await c.req.json();

  if (!configPath || !diskName || !diskPath) {
    return c.json({ error: "Missing configPath, diskName, or diskPath" }, 400);
  }

  try {
    // Read the config file
    let content = await Deno.readTextFile(configPath);
    
    // Check if disk name already exists
    const lines = content.split("\n");
    const diskExists = lines.some(line => {
      const trimmed = line.trim();
      return trimmed.startsWith(`data ${diskName} `);
    });

    if (diskExists) {
      return c.json({ error: `Disk name '${diskName}' already exists` }, 400);
    }

    // Find position to insert: after last data+content block, but before exclude lines
    let insertIndex = -1;
    let firstExcludeIndex = -1;

    // Find the last data line and first exclude line
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("data ") || trimmed.startsWith("content ")) {
        if (insertIndex === -1) {
          insertIndex = i + 1;
        }
      }
      if (trimmed.startsWith("exclude ") && firstExcludeIndex === -1) {
        firstExcludeIndex = i;
      }
    }

    // If we found exclude lines but no data/content, insert before exclude
    if (insertIndex === -1 && firstExcludeIndex !== -1) {
      insertIndex = firstExcludeIndex;
    }

    // If still not found, look for parity lines
    if (insertIndex === -1) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("parity ")) {
          insertIndex = i + 1;
          break;
        }
      }
    }

    // Default to end of file
    if (insertIndex === -1) {
      insertIndex = lines.length;
    }

    // Insert data line followed immediately by content line, then empty line
    const newDataLine = `data ${diskName} ${diskPath}`;
    const contentPath = `${diskPath}/.snapraid.content`;
    const newContentLine = `content ${contentPath}`;
    
    lines.splice(insertIndex, 0, "", newDataLine, newContentLine);

    // Write back to file
    content = lines.join("\n");
    await Deno.writeTextFile(configPath, content);

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
    let content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Find the last parity line or a good position to insert
    let insertIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("parity ")) {
        insertIndex = i + 1;
        break;
      }
    }

    // If no parity line found, insert at the beginning (after comments if any)
    if (insertIndex === -1) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed !== "" && !trimmed.startsWith("#")) {
          insertIndex = i;
          break;
        }
      }
      if (insertIndex === -1) insertIndex = 0;
    }

    // Insert the new parity line
    const newLine = `parity ${parityPath}`;
    lines.splice(insertIndex, 0, newLine);

    // Write back to file
    content = lines.join("\n");
    await Deno.writeTextFile(configPath, content);

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
    let content = await Deno.readTextFile(configPath);
    let lines = content.split("\n");

    // Remove the disk line and associated content file
    if (diskType === "data") {
      // First, find the data disk path to identify associated content file
      let diskPath: string | null = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(`data ${diskName} `)) {
          diskPath = trimmed.substring(`data ${diskName} `.length).trim();
          break;
        }
      }

      // Remove the data line
      lines = lines.filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith(`data ${diskName} `);
      });

      // Remove the associated content file if found
      if (diskPath) {
        const contentPath = `${diskPath}/.snapraid.content`;
        lines = lines.filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith(`content ${contentPath}`);
        });
      }
    } else if (diskType === "parity") {
      // Remove the first parity line found
      const parityIndex = lines.findIndex(line => line.trim().startsWith("parity "));
      if (parityIndex !== -1) {
        lines.splice(parityIndex, 1);
      }
    }

    // Write back to file
    content = lines.join("\n");
    await Deno.writeTextFile(configPath, content);

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
    let content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Check if pattern already exists
    const patternExists = lines.some(line => {
      const trimmed = line.trim();
      return trimmed === `exclude ${pattern}`;
    });

    if (patternExists) {
      return c.json({ error: `Pattern '${pattern}' already exists` }, 400);
    }

    // Find the last exclude line or a good position to insert
    let insertIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("exclude ")) {
        insertIndex = i + 1;
        break;
      }
    }

    // If no exclude line found, insert after data lines
    if (insertIndex === -1) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("data ")) {
          insertIndex = i + 1;
          break;
        }
      }
    }

    // If still not found, insert at the end
    if (insertIndex === -1) {
      insertIndex = lines.length;
    }

    // Insert the new exclude line
    const newLine = `exclude ${pattern}`;
    lines.splice(insertIndex, 0, newLine);

    // Write back to file
    content = lines.join("\n");
    await Deno.writeTextFile(configPath, content);

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
    let content = await Deno.readTextFile(configPath);
    let lines = content.split("\n");

    // Remove the exclude line
    lines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed !== `exclude ${pattern}`;
    });

    // Write back to file
    content = lines.join("\n");
    await Deno.writeTextFile(configPath, content);

    // Parse and return updated config
    const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default snapraid;
