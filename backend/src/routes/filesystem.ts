import { Hono } from "hono";
import { join } from "@std/path";

const filesystem = new Hono();

// GET /api/filesystem/browse - Browse directories for .conf files
filesystem.get("/browse", async (c) => {
  const dirPath = c.req.query("path") || Deno.env.get("HOME") || "/";
  const filterType = c.req.query("filter") || "conf"; // "conf" or "directories"

  try {
    const entries = [];
    for await (const entry of Deno.readDir(dirPath)) {
      // Filter based on type
      if (filterType === "directories") {
        // Show only directories for directory browsing
        if (entry.isDirectory) {
          entries.push({
            name: entry.name,
            isDirectory: true,
            path: join(dirPath, entry.name),
          });
        }
      } else {
        // Show .conf files and directories (original behavior)
        if (entry.isDirectory || entry.name.endsWith(".conf")) {
          entries.push({
            name: entry.name,
            isDirectory: entry.isDirectory,
            path: join(dirPath, entry.name),
          });
        }
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

// GET /api/filesystem/read - Read file content
filesystem.get("/read", async (c) => {
  const filePath = c.req.query("path");

  if (!filePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  try {
    const content = await Deno.readTextFile(filePath);
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

  try {
    await Deno.writeTextFile(path, content);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default filesystem;
