import { Hono } from "hono";
import type { DaemonTarget, EngineSettings } from "@shared/types.ts";
import {
  checkDaemon,
  loadEngineSettings,
  maskEngineSecrets,
  normalizeEngineSettings,
  normalizeTarget,
  saveEngineSettings,
} from "../engine/engine-settings.ts";
import { getEngine } from "../engine/engine.ts";
import { msg } from "@shared/i18n.ts";

const engine = new Hono();

const state = {
  // Builds and puts in place the engine for new settings, set up in main.ts
  apply: null as ((settings: EngineSettings) => void) | null,
};

export const setEngineApplier = (apply: (settings: EngineSettings) => void): void => {
  state.apply = apply;
};

// GET /api/engine - Which engine runs SnapRAID, without the daemons' passwords
engine.get("/", async (c) => {
  return c.json({ ...maskEngineSecrets(await loadEngineSettings()), active: getEngine().kind });
});

// PUT /api/engine - Save and switch the engine; not while a job runs, it would lose track of it
engine.put("/", async (c) => {
  try {
    if (getEngine().currentJob()) return c.json({ error: msg("server_error_job_running") }, 409);
    const { settings, error } = normalizeEngineSettings(
      await c.req.json<Partial<EngineSettings>>(),
      await loadEngineSettings(),
    );
    if (error) return c.json({ error }, 400);

    await saveEngineSettings(settings);
    state.apply?.(settings);
    return c.json({ ...maskEngineSecrets(settings), active: getEngine().kind });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/engine/test - Connect to one daemon with the given, possibly unsaved settings
engine.post("/test", async (c) => {
  try {
    const target = normalizeTarget(await c.req.json<DaemonTarget>(), await loadEngineSettings());
    return c.json(await checkDaemon(target));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { engine as engineRoutes };
