import { Hono } from "hono";
import { join } from "node:path";
import { BASE_PATH, resolveFromBase } from "../config/config.ts";
import { readdir, readFile, writeFile } from "node:fs/promises";

const filesystem = new Hono();

// GET /api/filesystem/browse - Browse directories for .conf files
filesystem.get("/browse", async (c) => {
  const relativePath = c.req.query("path");
  const dirPath = relativePath ? resolveFromBase(relativePath) : BASE_PATH;
  const filterType = c.req.query("filter") || "conf"; // "conf" or "directories"

  try {
    const entries = [];
    for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      const shouldInclude = filterType === "directories"
        ? entry.isDirectory()
        : entry.isDirectory() || entry.name.endsWith(".conf");
      
      if (shouldInclude) {
        entries.push({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          path: join(dirPath, entry.name),
        });
      }
    }

    return c.json({ path: dirPath, entries });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/filesystem/read - Read file content
filesystem.get("/read", async (c) => {
  const relativePath = c.req.query("path");

  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const filePath = resolveFromBase(relativePath);

  try {
    const content = await readFile(filePath, "utf8");
    return c.json({ content });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/filesystem/write - Write file content
filesystem.post("/write", async (c) => {
  const { path, content } = await c.req.json();

  if (!path || content === undefined) {
    return c.json({ error: "Missing path or content" }, 400);
  }

  const filePath = resolveFromBase(path);

  try {
    await writeFile(filePath, content);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { filesystem as filesystemRoutes };
