import { Hono } from "hono";
import { join } from "@std/path";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { resolveFromBase } from "../config.ts";

const configOperations = new Hono();

// POST /api/snapraid/add-exclude - Add an exclude pattern to SnapRAID config
configOperations.post("/add-exclude", async (c) => {
  const { configPath: relativePath, pattern } = await c.req.json();

  if (!relativePath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

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
  const { configPath: relativePath, pattern } = await c.req.json();

  if (!relativePath || !pattern) {
    return c.json({ error: "Missing configPath or pattern" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

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
  const { configPath: relativePath, poolPath } = await c.req.json();

  if (!relativePath) {
    return c.json({ error: "Missing configPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

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

/**
 * Index after the last line starting with one of the keywords, trying them in order.
 * Falls back to the end of the file
 */
const insertIndexAfter = (lines: string[], keywords: RegExp[]): number => {
  for (const keyword of keywords) {
    const index = lines.findLastIndex((line) => keyword.test(line.trim()));
    if (index !== -1) return index + 1;
  }
  return lines.length;
};

const CONTENT_LINE = /^content\s/;
const PARITY_LINE = /^(parity|[2-6]-parity|z-parity)\s/;

// POST /api/snapraid/add-content - Add a content file to SnapRAID config
configOperations.post("/add-content", async (c) => {
  const { configPath: relativePath, contentPath } = await c.req.json();

  if (!relativePath || !contentPath?.trim()) {
    return c.json({ error: "Missing configPath or contentPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);
  const value = contentPath.trim();

  try {
    const lines = (await Deno.readTextFile(configPath)).split("\n");
    if (lines.some((line) => line.trim() === `content ${value}`)) {
      return c.json({ error: `Content file '${value}' already exists` }, 400);
    }

    const insertIndex = insertIndexAfter(lines, [CONTENT_LINE, PARITY_LINE]);
    lines.splice(insertIndex, 0, `content ${value}`);
    await Deno.writeTextFile(configPath, lines.join("\n"));

    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/remove-content - Remove a content file from SnapRAID config
configOperations.post("/remove-content", async (c) => {
  const { configPath: relativePath, contentPath } = await c.req.json();

  if (!relativePath || !contentPath) {
    return c.json({ error: "Missing configPath or contentPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const lines = (await Deno.readTextFile(configPath)).split("\n");
    const updatedLines = lines.filter((line) => line.trim() !== `content ${contentPath}`);
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Numeric options the visual editor can set, with the spellings SnapRAID accepts
const OPTIONS: Record<string, RegExp> = {
  autosave: /^autosave\s/,
  blocksize: /^(blocksize|block_size)\s/,
};

// POST /api/snapraid/set-option - Set or remove (value null) autosave or blocksize
configOperations.post("/set-option", async (c) => {
  const { configPath: relativePath, option, value } = await c.req.json();

  if (!relativePath || !(option in OPTIONS)) {
    return c.json({ error: "Missing configPath or unknown option" }, 400);
  }
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    return c.json({ error: "Value must be a positive whole number" }, 400);
  }

  const configPath = resolveFromBase(relativePath);
  const pattern = OPTIONS[option];

  try {
    const lines = (await Deno.readTextFile(configPath)).split("\n");
    const existing = lines.findIndex((line) => pattern.test(line.trim()));

    if (value === null) {
      if (existing !== -1) lines.splice(existing, 1);
    } else if (existing !== -1) {
      lines[existing] = `${option} ${value}`;
    } else {
      const insertIndex = insertIndexAfter(lines, [CONTENT_LINE, PARITY_LINE]);
      lines.splice(insertIndex, 0, `${option} ${value}`);
    }

    await Deno.writeTextFile(configPath, lines.join("\n"));

    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { configOperations as configOperationsRoutes };
