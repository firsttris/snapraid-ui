import { Hono } from "hono";
import type { HomeAssistantSettings } from "@shared/types.ts";
import {
  type HomeAssistant,
  loadHomeAssistantSettings,
  maskHomeAssistantSecrets,
  normalizeHomeAssistantSettings,
  saveHomeAssistantSettings,
  testHomeAssistantConnection,
} from "../home-assistant-service.ts";

const homeAssistant = new Hono();

const state = { service: null as HomeAssistant | null };

export const setHomeAssistant = (service: HomeAssistant): void => {
  state.service = service;
};

// GET /api/home-assistant - Settings without the broker password, and the connection
homeAssistant.get("/", async (c) => {
  return c.json({
    settings: maskHomeAssistantSecrets(await loadHomeAssistantSettings()),
    status: state.service?.status() ?? { connected: false },
  });
});

// PUT /api/home-assistant - Save and reconnect
homeAssistant.put("/", async (c) => {
  const { settings, error } = normalizeHomeAssistantSettings(
    await c.req.json<Partial<HomeAssistantSettings>>(),
    await loadHomeAssistantSettings(),
  );
  if (error) return c.json({ error }, 400);
  await saveHomeAssistantSettings(settings);
  await state.service?.start();
  return c.json({ settings: maskHomeAssistantSecrets(settings), status: state.service?.status() ?? { connected: false } });
});

// POST /api/home-assistant/test - Connect to the broker with the given, possibly unsaved settings
homeAssistant.post("/test", async (c) => {
  const { settings } = normalizeHomeAssistantSettings(
    { ...(await c.req.json<Partial<HomeAssistantSettings>>()), enabled: true },
    await loadHomeAssistantSettings(),
  );
  if (!/^(mqtts?|wss?):\/\/[^/]+/.test(settings.url)) {
    return c.json({ ok: false, error: "The broker address must start with mqtt://, mqtts://, ws:// or wss://" });
  }
  const error = await testHomeAssistantConnection(settings);
  return c.json(error ? { ok: false, error } : { ok: true });
});

export { homeAssistant as homeAssistantRoutes };
