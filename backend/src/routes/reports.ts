import { Hono } from "hono";
import type { SnapRaidRunner } from "../snapraid-runner.ts";
import { resolveFromBase } from "../config.ts";
import { getEngine } from "../engine/engine.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { changedPaths, deleteDuplicates, insideDisk, markGone, MAX_DUPLICATE_DELETIONS } from "../duplicates.ts";
import type { DiffReport, DuplicateDeletion } from "@shared/types.ts";
import { msg } from "@shared/i18n.ts";

// New and changed files get their size, for the totals per folder; a big diff is not stat'ed whole
const MAX_SIZED_FILES = 50_000;

const withSizes = async (configPath: string, diff: DiffReport): Promise<DiffReport> => {
  let data: Record<string, string>;
  try {
    data = (await parseSnapRaidConfig(configPath)).data;
  } catch {
    return diff;
  }
  let sized = 0;
  const files = [];
  for (const file of diff.files) {
    const root = file.disk ? data[file.disk] : undefined;
    const path = root && (file.status === "added" || file.status === "updated") && sized < MAX_SIZED_FILES
      ? insideDisk(root, file.name)
      : null;
    if (!path) {
      files.push(file);
      continue;
    }
    sized++;
    try {
      files.push({ ...file, size: (await Deno.stat(path)).size });
    } catch {
      files.push(file);
    }
  }
  return { ...diff, files };
};

const reports = new Hono();

// Runner will be injected
let runner: SnapRaidRunner;

export const setReportsRunner = (snapraidRunner: SnapRaidRunner): void => {
  runner = snapraidRunner;
};

// GET /api/snapraid/devices - Get device information
reports.get("/devices", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runDevices(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/list - Get file list
reports.get("/list", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runList(configPath);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/dup - Duplicate files, from the hashes in the content file; copies deleted
// since the last sync are marked gone
reports.get("/dup", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await runner.runDup(configPath);
    const { data } = await parseSnapRaidConfig(configPath);
    return c.json(await markGone(result, data));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/snapraid/diff - Get diff report
reports.get("/diff", async (c) => {
  const relativePath = c.req.query("path");
  
  if (!relativePath) {
    return c.json({ error: "Missing path parameter" }, 400);
  }

  const configPath = resolveFromBase(relativePath);

  try {
    const result = await getEngine().readDiff(configPath);
    return c.json(await withSizes(configPath, result));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/snapraid/duplicates/delete - Delete duplicates, each one only while it and the copy
// that stays are as at the last sync: { configPath, files: DuplicateDeletion[] }
reports.post("/duplicates/delete", async (c) => {
  const { configPath: relativePath, files } = await c.req.json<{ configPath?: string; files?: DuplicateDeletion[] }>();
  if (!relativePath || !Array.isArray(files) || files.length === 0) {
    return c.json({ error: "Missing configPath or files" }, 400);
  }
  if (
    files.some((file) =>
      typeof file?.disk !== "string" || typeof file.path !== "string" || typeof file.keepDisk !== "string" ||
      typeof file.keepPath !== "string" || typeof file.size !== "number"
    )
  ) {
    return c.json({ error: "Each file needs disk, path, keepDisk, keepPath and size" }, 400);
  }
  if (files.length > MAX_DUPLICATE_DELETIONS) {
    return c.json({ error: msg("server_error_too_many_duplicates", { max: MAX_DUPLICATE_DELETIONS }) }, 400);
  }
  // The diff needs SnapRAID's lock, and a job may be reading the files
  if (getEngine().currentJob()) {
    return c.json({ error: msg("server_error_job_running") }, 409);
  }

  const configPath = resolveFromBase(relativePath);
  try {
    const { data } = await parseSnapRaidConfig(configPath);
    const changed = changedPaths(await getEngine().readDiff(configPath));
    return c.json(await deleteDuplicates(files, { dataDisks: data, changed }));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { reports as reportsRoutes };
