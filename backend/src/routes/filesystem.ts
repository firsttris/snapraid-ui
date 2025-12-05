import { Hono } from "hono";
import { join } from "@std/path";

const filesystem = new Hono();

// GET /api/filesystem/browse - Browse directories for .conf files
filesystem.get("/browse", async (c) => {
  const dirPath = c.req.query("path") || Deno.env.get("HOME") || "/";

  try {
    const entries = [];
    for await (const entry of Deno.readDir(dirPath)) {
      // Only show .conf files and directories
      if (entry.isDirectory || entry.name.endsWith(".conf")) {
        entries.push({
          name: entry.name,
          isDirectory: entry.isDirectory,
          path: join(dirPath, entry.name),
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return c.json({ path: dirPath, entries });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default filesystem;
