import { Hono } from "hono";
import type { ConfigFileCheck } from "@shared/types.ts";
import { loadAppConfig, parseSnapRaidConfig, saveAppConfig } from "../config-parser.ts";
import { BASE_PATH, resolveFromBase, toStoredPath } from "../config.ts";
import { msg } from "@shared/i18n.ts";
import { BackupError, createBackup, restoreBackup } from "../backup.ts";
import { reloadSchedules } from "./schedules.ts";

const config = new Hono();

// Starting point for a config created in the UI, disks are added in the visual editor
const CONFIG_TEMPLATE = `# SnapRAID configuration, created by SnapRAID UI
# Add parity, content and data disks in the visual editor, e.g.
#   parity /mnt/parity1/snapraid.parity
#   content /var/snapraid/snapraid.content
#   data d1 /mnt/disk1/

exclude *.unrecoverable
exclude /tmp/
exclude /lost+found/
`;

const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
};

// GET /api/config - Load app config
config.get("/", async (c) => {
  const appConfig = await loadAppConfig();
  return c.json(appConfig);
});

// POST /api/config - Save app config
config.post("/", async (c) => {
  const body = await c.req.json();
  await saveAppConfig(body);
  return c.json({ success: true });
});

// GET /api/config/backup - Settings, histories and SnapRAID configs as one file
config.get("/backup", async (c) => {
  const backup = await createBackup();
  const date = backup.exportedAt.slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="snapraid-ui-backup-${date}.json"`);
  return c.json(backup);
});

// POST /api/config/restore - Write a backup back and restart the schedules
config.post("/restore", async (c) => {
  try {
    const result = await restoreBackup(await c.req.json());
    await reloadSchedules();
    return c.json(result);
  } catch (error) {
    if (error instanceof BackupError || error instanceof SyntaxError) {
      return c.json({ error: error instanceof BackupError ? error.message : msg("server_error_backup_invalid") }, 400);
    }
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/config/add - Add an existing SnapRAID config file
config.post("/add", async (c) => {
  const { name, path, enabled = true } = await c.req.json();

  if (!name?.trim() || !path?.trim()) {
    return c.json({ error: "Missing name or path" }, 400);
  }

  const absolute = resolveFromBase(path.trim());
  if (!(await isFile(absolute))) {
    return c.json({ error: msg("server_error_config_file_not_found", { path: absolute }) }, 400);
  }

  const appConfig = await loadAppConfig();
  if (appConfig.snapraidConfigs.some((cfg) => resolveFromBase(cfg.path) === absolute)) {
    return c.json({ error: msg("server_error_config_already_added") }, 400);
  }

  appConfig.snapraidConfigs.push({ name: name.trim(), path: toStoredPath(absolute), enabled });
  await saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig });
});

// POST /api/config/create - Create a new config file in BASE_PATH from a template and add it
config.post("/create", async (c) => {
  const { name, fileName } = await c.req.json();

  if (!name?.trim() || !fileName?.trim()) {
    return c.json({ error: "Missing name or file name" }, 400);
  }
  const trimmed = fileName.trim();
  if (!/^[\w.-]+$/.test(trimmed)) {
    return c.json({ error: msg("server_error_invalid_file_name") }, 400);
  }

  const storedPath = trimmed.endsWith(".conf") ? trimmed : `${trimmed}.conf`;
  const absolute = resolveFromBase(storedPath);

  try {
    await Deno.writeTextFile(absolute, CONFIG_TEMPLATE, { createNew: true });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return c.json({ error: msg("server_error_file_exists", { path: absolute }) }, 409);
    }
    return c.json({ error: String(error) }, 500);
  }

  const appConfig = await loadAppConfig();
  appConfig.snapraidConfigs.push({ name: name.trim(), path: storedPath, enabled: true });
  await saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig, path: storedPath });
});

// POST /api/config/update - Rename or enable/disable a SnapRAID config
config.post("/update", async (c) => {
  const { path, name, enabled } = await c.req.json();

  if (!path) {
    return c.json({ error: "Missing path" }, 400);
  }
  if (name !== undefined && !String(name).trim()) {
    return c.json({ error: msg("server_error_name_empty") }, 400);
  }

  const appConfig = await loadAppConfig();
  const target = appConfig.snapraidConfigs.find((cfg) => cfg.path === path);
  if (!target) {
    return c.json({ error: msg("server_error_config_not_found") }, 404);
  }

  if (name !== undefined) target.name = String(name).trim();
  if (enabled !== undefined) target.enabled = Boolean(enabled);
  await saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig });
});

// POST /api/config/remove - Remove a SnapRAID config from the UI, the file is kept
config.post("/remove", async (c) => {
  const { path } = await c.req.json();

  if (!path) {
    return c.json({ error: "Missing path" }, 400);
  }

  const appConfig = await loadAppConfig();
  appConfig.snapraidConfigs = appConfig.snapraidConfigs.filter(
    (cfg) => cfg.path !== path
  );
  await saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig });
});

// GET /api/config/check - Whether each config file exists and what it contains
config.get("/check", async (c) => {
  const appConfig = await loadAppConfig();
  const checks = await Promise.all(
    appConfig.snapraidConfigs.map(async ({ path }): Promise<ConfigFileCheck> => {
      const empty = { path, dataDisks: 0, parityLevels: 0, contentFiles: 0 };
      const absolute = resolveFromBase(path);
      if (!(await isFile(absolute))) return { ...empty, exists: false };

      try {
        const parsed = await parseSnapRaidConfig(absolute);
        return {
          path,
          exists: true,
          dataDisks: Object.keys(parsed.data).length,
          parityLevels: parsed.parity.length,
          contentFiles: parsed.content.length,
        };
      } catch (error) {
        return { ...empty, exists: true, error: String(error) };
      }
    }),
  );
  return c.json(checks);
});

// GET /api/config/base-path - Get base path
config.get("/base-path", (c) => {
  return c.json({ basePath: BASE_PATH });
});

export { config as configRoutes };
