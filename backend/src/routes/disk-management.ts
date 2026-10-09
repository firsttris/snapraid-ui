import { Hono } from "hono";
import { join } from "@std/path";
import {
  MAX_PARITY_LEVEL,
  parityKeyword,
  parseParityLine,
  parseSnapRaidConfig,
} from "../config-parser.ts";
import { resolveFromBase } from "../config.ts";
import { msg } from "@shared/i18n.ts";

const diskManagement = new Hono();

class ParityLevelError extends Error {}

// POST /api/snapraid/add-data-disk - Add a data disk to SnapRAID config
diskManagement.post("/add-data-disk", async (c) => {
  const { configPath: relativePath, diskName, diskPath } = await c.req.json();

  if (!relativePath || !diskName || !diskPath) {
    return c.json({ error: "Missing configPath, diskName, or diskPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    
    // Check if disk name already exists
    const lines = content.split("\n");
    const diskExists = lines.some(line => line.trim().startsWith(`data ${diskName} `));

    if (diskExists) {
      return c.json({ error: msg("server_error_disk_name_exists", { disk: diskName }) }, 400);
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
        .find(({ line }) => parseParityLine(line))
        ?.index;
      
      return lastParityIndex !== undefined ? lastParityIndex + 1 : lns.length;
    };

    const insertIndex = findInsertIndex(lines);

    // Insert data line followed immediately by content line, then empty line
    const newDataLine = `data ${diskName} ${diskPath}`;
    // SnapRAID excludes its content files by comparing the path as written, `/mnt/disk1//.snapraid.content`
    // would not match and the file would be synced like a data file
    const contentPath = join(diskPath, ".snapraid.content");
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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/add-parity-disk - Add a parity disk to SnapRAID config
diskManagement.post("/add-parity-disk", async (c) => {
  const { configPath: relativePath, parityPath } = await c.req.json();

  if (!relativePath || !parityPath) {
    return c.json({ error: "Missing configPath or parityPath" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  // Validate that parityPath ends with .parity
  if (!parityPath.endsWith(".parity")) {
    return c.json({ error: msg("server_error_parity_extension") }, 400);
  }

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // New parity always becomes the next level above the existing ones
    const levels = lines.map(parseParityLine).filter(parity => parity !== null);
    const nextLevel = Math.max(0, ...levels.map(parity => parity.level)) + 1;
    if (nextLevel > MAX_PARITY_LEVEL) {
      return c.json({ error: msg("server_error_max_parity_levels", { max: MAX_PARITY_LEVEL }) }, 400);
    }

    // Insert after the last parity line, or before the first setting
    const findParityInsertIndex = (lns: string[]): number => {
      const lastParityIndex = lns.findLastIndex(line => parseParityLine(line));
      if (lastParityIndex !== -1) return lastParityIndex + 1;
      
      const firstNonCommentIndex = lns
        .map((line, i) => ({ line: line.trim(), index: i }))
        .find(({ line }) => line !== "" && !line.startsWith("#"))
        ?.index;
      
      return firstNonCommentIndex ?? 0;
    };

    const insertIndex = findParityInsertIndex(lines);
    const newLine = `${parityKeyword(nextLevel)} ${parityPath}`;
    
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

// POST /api/snapraid/remove-disk - Remove the highest parity level from SnapRAID config.
// Data disks need a `sync -E` in between, see POST /api/snapraid/remove-data-disk
diskManagement.post("/remove-disk", async (c) => {
  const { configPath: relativePath, diskType, level } = await c.req.json();

  if (!relativePath) {
    return c.json({ error: "Missing required parameters" }, 400);
  }
  if (diskType !== "parity") {
    return c.json({ error: "Data disks are removed with /remove-data-disk" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    // Read the config file
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    // Only the highest level can go, SnapRAID needs the levels without gaps
    const parityLines = lines
      .map((line, index) => ({ parity: parseParityLine(line), index }))
      .filter(({ parity }) => parity !== null);
    const highest = parityLines.reduce<typeof parityLines[number] | null>(
      (max, entry) => (!max || entry.parity!.level > max.parity!.level ? entry : max),
      null,
    );
    if (highest && level !== undefined && level !== highest.parity!.level) {
      throw new ParityLevelError(
        msg("server_error_highest_parity_only", { level: highest.parity!.keyword }),
      );
    }
    const updatedLines = highest
      ? [...lines.slice(0, highest.index), ...lines.slice(highest.index + 1)]
      : lines;

    // Write back to file
    await Deno.writeTextFile(configPath, updatedLines.join("\n"));

    // Parse and return updated config
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    if (error instanceof ParityLevelError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: String(error) }, 500);
  }
});

export { diskManagement as diskManagementRoutes };
