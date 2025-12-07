import { Hono } from "hono";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { resolvePath } from "../utils/path.ts";

export const diskManagement = new Hono();

// POST /api/snapraid/add-data-disk - Add a data disk to SnapRAID config
diskManagement.post("/add-data-disk", async (c) => {
  const { configPath: rawConfigPath, diskName, diskPath } = await c.req.json();

  if (!rawConfigPath || !diskName || !diskPath) {
    return c.json({ error: "Missing configPath, diskName, or diskPath" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/add-parity-disk - Add a parity disk to SnapRAID config
diskManagement.post("/add-parity-disk", async (c) => {
  const { configPath: rawConfigPath, parityPath } = await c.req.json();

  if (!rawConfigPath || !parityPath) {
    return c.json({ error: "Missing configPath or parityPath" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/remove-disk - Remove a disk from SnapRAID config
diskManagement.post("/remove-disk", async (c) => {
  const { configPath: rawConfigPath, diskName, diskType } = await c.req.json();

  if (!rawConfigPath || (!diskName && diskType !== "parity")) {
    return c.json({ error: "Missing required parameters" }, 400);
  }

  const configPath = await resolvePath(rawConfigPath);

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
    const parsed = await parseSnapRaidConfig(configPath);
    return c.json({ success: true, config: parsed });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
