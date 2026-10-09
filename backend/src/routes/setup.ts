import { Hono } from "hono";
import { type ArraySetup, buildSnapraidConf, setupProblems } from "@shared/array-setup.ts";
import { msg } from "@shared/i18n.ts";
import { loadAppConfig, saveAppConfig } from "../config-parser.ts";
import { BASE_PATH, resolveFromBase } from "../config.ts";
import { listMountCandidates } from "../setup.ts";

const setup = new Hono();

const isFile = async (path: string) => {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
};

const isDirectory = async (path: string) => {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
};

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
  const problems = setupProblems(arraySetup);
  if (problems.length > 0) {
    return c.json({ error: msg("server_error_setup_invalid", { problems: problems.join(", ") }), problems }, 400);
  }
  const paths = [...arraySetup.dataDisks.map((disk) => disk.path), ...arraySetup.parityPaths];
  const missing = [];
  for (const path of paths) if (!(await isDirectory(path))) missing.push(path);
  if (missing.length > 0) {
    return c.json({ error: msg("server_error_setup_missing", { paths: missing.join(", ") }) }, 400);
  }

  const storedPath = file.endsWith(".conf") ? file : `${file}.conf`;
  const configName = storedPath.replace(/\.conf$/, "");
  try {
    await Deno.writeTextFile(resolveFromBase(storedPath), buildSnapraidConf(arraySetup, BASE_PATH, configName), {
      createNew: true,
    });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return c.json({ error: msg("server_error_file_exists", { path: resolveFromBase(storedPath) }) }, 409);
    }
    return c.json({ error: String(error) }, 500);
  }

  const appConfig = await loadAppConfig();
  // The entry the first start created for a snapraid.conf that was never put there
  const placeholders = await Promise.all(
    appConfig.snapraidConfigs.map(async (entry) =>
      entry.name === "Default" && entry.path === "snapraid.conf" && !(await isFile(resolveFromBase(entry.path)))
    ),
  );
  appConfig.snapraidConfigs = appConfig.snapraidConfigs.filter((_, index) => !placeholders[index]);
  appConfig.snapraidConfigs.push({ name: name.trim(), path: storedPath, enabled: true });
  await saveAppConfig(appConfig);
  return c.json({ success: true, path: storedPath }, 201);
});

export { setup as setupRoutes };
