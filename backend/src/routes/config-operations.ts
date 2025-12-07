import { Hono } from "hono";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { resolvePath } from "../utils/path.ts";

const configOperations = new Hono();

// POST /api/snapraid/remove-exclude - Remove an exclude pattern from SnapRAID config
configOperations.post("/remove-exclude", async (c) => {
  const { configPath: rawConfigPath, pattern } = await c.req.json();

  if (!rawConfigPath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/remove-exclude - Remove an exclude pattern from SnapRAID config
configOperations.post("/remove-exclude", async (c) => {
  const { configPath: rawConfigPath, pattern } = await c.req.json();

  if (!rawConfigPath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Remove the exclude line
    const updatedLines = lines.filter(line => line.trim() !== `exclude ${pattern}`);

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/set-pool - Set pool directory in SnapRAID config
configOperations.post("/set-pool", async (c) => {
  const { configPath: rawConfigPath, poolPath } = await c.req.json();

  if (!rawConfigPath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { configOperations };
