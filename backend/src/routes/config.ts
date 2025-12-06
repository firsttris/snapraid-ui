import { Hono } from "hono";
import { ConfigParser } from "../config-parser.ts";

const config = new Hono();

// GET /api/config - Load app config
config.get("/", async (c) => {
  const appConfig = await ConfigParser.loadAppConfig();
  return c.json(appConfig);
});

// POST /api/config - Save app config
config.post("/", async (c) => {
  const body = await c.req.json();
  await ConfigParser.saveAppConfig(body);
  return c.json({ success: true });
});

// POST /api/config/add - Add new SnapRAID config
config.post("/add", async (c) => {
  const { name, path, enabled = true } = await c.req.json();

  if (!name || !path) {
    return c.json({ error: "Missing name or path" }, 400);
  }

  const appConfig = await ConfigParser.loadAppConfig();

  // Check if path already exists
  if (appConfig.snapraidConfigs.some((cfg) => cfg.path === path)) {
    return c.json({ error: "Config path already exists" }, 400);
  }

  appConfig.snapraidConfigs.push({ name, path, enabled });
  await ConfigParser.saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig });
});

// POST /api/config/remove - Remove SnapRAID config
config.post("/remove", async (c) => {
  const { path } = await c.req.json();

  if (!path) {
    return c.json({ error: "Missing path" }, 400);
  }

  const appConfig = await ConfigParser.loadAppConfig();
  appConfig.snapraidConfigs = appConfig.snapraidConfigs.filter(
    (cfg) => cfg.path !== path
  );
  await ConfigParser.saveAppConfig(appConfig);

  return c.json({ success: true, config: appConfig });
});

export default config;
