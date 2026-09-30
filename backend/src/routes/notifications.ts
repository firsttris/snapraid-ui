import { Hono } from "hono";
import type { NotificationChannel, NotificationSettings } from "@shared/types.ts";
import {
  deliver,
  loadNotificationSettings,
  maskSecrets,
  resolveSecrets,
  saveNotificationSettings,
  validateNotificationSettings,
} from "../notifications.ts";

const notifications = new Hono();

const TEST_MESSAGE = {
  en: {
    title: "Test notification",
    message: "Notifications from SnapRAID UI work. You will hear from here when a job fails or a disk shows problems.",
  },
  de: {
    title: "Testnachricht",
    message:
      "Benachrichtigungen von SnapRAID UI funktionieren. Hier meldet sich die UI, wenn ein Job fehlschlägt oder eine Platte Probleme zeigt.",
  },
};

const CHANNELS: NotificationChannel[] = ["email", "ntfy", "webhook"];

// GET /api/notifications - Settings without the stored password and token
notifications.get("/", async (c) => {
  return c.json(maskSecrets(await loadNotificationSettings()));
});

// PUT /api/notifications - Save settings
notifications.put("/", async (c) => {
  try {
    const body = await c.req.json<Partial<NotificationSettings>>();
    const settings = resolveSecrets(body, await loadNotificationSettings());
    const invalid = validateNotificationSettings(settings);
    if (invalid) return c.json({ error: invalid }, 400);

    await saveNotificationSettings(settings);
    return c.json(maskSecrets(settings));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/notifications/test - Send a test message with the given, possibly unsaved settings
notifications.post("/test", async (c) => {
  try {
    const { settings: body, channel } = await c.req.json<{
      settings: Partial<NotificationSettings>;
      channel?: NotificationChannel;
    }>();
    if (channel && !CHANNELS.includes(channel)) {
      return c.json({ error: `Unknown channel '${channel}'` }, 400);
    }

    const settings = resolveSecrets(body, await loadNotificationSettings());
    const invalid = validateNotificationSettings(settings);
    if (invalid) return c.json({ error: invalid }, 400);

    const channels = channel ? [channel] : CHANNELS.filter((ch) => settings[ch].enabled);
    if (channels.length === 0) {
      return c.json({ error: "No notification channel is enabled" }, 400);
    }

    const results = await deliver(
      settings,
      { event: "test", severity: "info", ...TEST_MESSAGE[settings.language] },
      channels,
    );
    return c.json(results);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { notifications as notificationsRoutes };
