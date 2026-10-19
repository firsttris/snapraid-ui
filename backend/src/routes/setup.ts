import { Hono } from "hono";
import type { ArraySetup } from "@shared/array-setup.ts";
import { msg } from "@shared/i18n.ts";
import { createArray, listMountCandidates } from "../setup.ts";

const setup = new Hono();

// GET /api/setup/mounts - Mounted filesystems that can become disks of a new array
setup.get("/mounts", async (c) => {
  try {
    return c.json(await listMountCandidates());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/setup/create - Write the snapraid.conf of a new array into the data directory and add it:
// { name, fileName, setup: ArraySetup }
setup.post("/create", async (c) => {
  const { name, fileName, setup: arraySetup } = await c.req.json<{
    name?: string;
    fileName?: string;
    setup?: ArraySetup;
  }>();
  const file = fileName?.trim() ?? "";
  if (!name?.trim() || !/^[\w.-]+$/.test(file) || !arraySetup) {
    return c.json({ error: msg("server_error_invalid_file_name") }, 400);
  }
  const result = await createArray(name, file, arraySetup);
  if (!result.ok) {
    return c.json({ error: result.error, ...(result.problems ? { problems: result.problems } : {}) }, result.status);
  }
  return c.json({ success: true, path: result.path }, 201);
});

export { setup as setupRoutes };
