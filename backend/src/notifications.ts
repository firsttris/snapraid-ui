import nodemailer from "nodemailer";
import { existsSync } from "@std/fs";
import {
  type NotificationChannel,
  type NotificationEvent,
  type NotificationSettings,
  type NotificationTestResult,
  SECRET_MASK,
} from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";

export type Severity = "info" | "warning" | "error";

export interface Notification {
  event: NotificationEvent | "test";
  severity: Severity;
  title: string;
  message: string;
}

const SETTINGS_FILE = "notifications.json";
const SEND_TIMEOUT_MS = 15_000;
// Discord rejects longer messages
const WEBHOOK_TEXT_LIMIT = 1900;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  language: "en",
  uiUrl: "",
  events: {
    job_failed: true,
    data_errors: true,
    schedule_skipped: true,
    smart_warning: true,
    job_succeeded: false,
  },
  includeManualJobs: false,
  smartFailureThreshold: 25,
  email: {
    enabled: false,
    host: "",
    port: 587,
    security: "starttls",
    username: "",
    password: "",
    from: "",
    to: "",
  },
  ntfy: {
    enabled: false,
    server: "https://ntfy.sh",
    topic: "",
    token: "",
  },
  webhook: {
    enabled: false,
    url: "",
  },
};

const settingsPath = () => resolveFromBase(SETTINGS_FILE);

// Fills settings written by an older version with the defaults of newer fields
const withDefaults = (stored: Partial<NotificationSettings>): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...stored,
  events: { ...DEFAULT_NOTIFICATION_SETTINGS.events, ...stored.events },
  email: { ...DEFAULT_NOTIFICATION_SETTINGS.email, ...stored.email },
  ntfy: { ...DEFAULT_NOTIFICATION_SETTINGS.ntfy, ...stored.ntfy },
  webhook: { ...DEFAULT_NOTIFICATION_SETTINGS.webhook, ...stored.webhook },
});

export const loadNotificationSettings = async (): Promise<NotificationSettings> => {
  const path = settingsPath();
  if (!existsSync(path)) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    return withDefaults(JSON.parse(await Deno.readTextFile(path)));
  } catch (error) {
    console.error(`Failed to read ${path}, notifications are disabled:`, error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

/**
 * Settings as sent to the browser, without the stored password and token
 */
export const maskSecrets = (settings: NotificationSettings): NotificationSettings => ({
  ...settings,
  email: { ...settings.email, password: settings.email.password ? SECRET_MASK : "" },
  ntfy: { ...settings.ntfy, token: settings.ntfy.token ? SECRET_MASK : "" },
});

/**
 * Settings from the browser; a masked secret stands for the stored one
 */
export const resolveSecrets = (
  incoming: Partial<NotificationSettings>,
  stored: NotificationSettings,
): NotificationSettings => {
  const settings = withDefaults(incoming);
  return {
    ...settings,
    email: {
      ...settings.email,
      password: settings.email.password === SECRET_MASK ? stored.email.password : settings.email.password,
    },
    ntfy: {
      ...settings.ntfy,
      token: settings.ntfy.token === SECRET_MASK ? stored.ntfy.token : settings.ntfy.token,
    },
  };
};

const senderAddress = ({ email }: NotificationSettings) => email.from.trim() || email.username.trim();

export const validateNotificationSettings = (settings: NotificationSettings): string | null => {
  const { email, ntfy, webhook } = settings;
  if (email.enabled && (!email.host || !email.to)) return "E-mail needs an SMTP server and a recipient";
  if (email.enabled && !(email.port > 0 && email.port < 65536)) return "Invalid SMTP port";
  // Without a valid From header most servers reject the mail
  if (email.enabled && !senderAddress(settings).includes("@")) {
    return "E-mail needs a sender address, the username is not one";
  }
  if (ntfy.enabled && (!ntfy.server || !ntfy.topic)) return "ntfy needs a server and a topic";
  if (webhook.enabled && !/^https?:\/\//.test(webhook.url)) return "The webhook URL must start with http:// or https://";
  if (!(settings.smartFailureThreshold > 0 && settings.smartFailureThreshold <= 100)) {
    return "The SMART threshold must be between 1 and 100";
  }
  return null;
};

export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  // Holds the SMTP password and the ntfy token
  await Deno.writeTextFile(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
};

// ====================
// Channels
// ====================

const withLink = (text: string, uiUrl: string) => (uiUrl ? `${text}\n\n${uiUrl}` : text);

const sendEmail = async (settings: NotificationSettings, notification: Notification): Promise<void> => {
  const { email } = settings;
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.security === "tls",
    requireTLS: email.security === "starttls",
    ignoreTLS: email.security === "none",
    auth: email.username ? { user: email.username, pass: email.password } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  await transport.sendMail({
    from: senderAddress(settings),
    to: email.to,
    subject: `[SnapRAID] ${notification.title}`,
    text: withLink(notification.message, settings.uiUrl),
  });
};

const NTFY_PRIORITY: Record<Severity, number> = { info: 2, warning: 4, error: 5 };
const NTFY_TAGS: Record<Severity, string[]> = {
  info: ["white_check_mark"],
  warning: ["warning"],
  error: ["rotating_light"],
};

const ensureOk = async (response: Response): Promise<void> => {
  if (response.ok) return;
  const body = (await response.text().catch(() => "")).trim().slice(0, 200);
  throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ""}`);
};

// JSON publishing, header values would not survive umlauts
const sendNtfy = async (settings: NotificationSettings, notification: Notification): Promise<void> => {
  const { ntfy, uiUrl } = settings;
  const response = await fetch(ntfy.server.replace(/\/+$/, ""), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ntfy.token ? { Authorization: `Bearer ${ntfy.token}` } : {}),
    },
    body: JSON.stringify({
      topic: ntfy.topic,
      title: notification.title,
      message: notification.message,
      priority: NTFY_PRIORITY[notification.severity],
      tags: NTFY_TAGS[notification.severity],
      ...(uiUrl ? { click: uiUrl, actions: [{ action: "view", label: "SnapRAID UI", url: uiUrl }] } : {}),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  await ensureOk(response);
};

// Generic JSON; `text` and `content` make Slack/Mattermost and Discord webhooks show the message as is
const sendWebhook = async (settings: NotificationSettings, notification: Notification): Promise<void> => {
  const text = withLink(`**${notification.title}**\n${notification.message}`, settings.uiUrl)
    .slice(0, WEBHOOK_TEXT_LIMIT);
  const response = await fetch(settings.webhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: notification.event,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      url: settings.uiUrl || undefined,
      timestamp: new Date().toISOString(),
      text,
      content: text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  await ensureOk(response);
};

const SENDERS: Record<NotificationChannel, (s: NotificationSettings, n: Notification) => Promise<void>> = {
  email: sendEmail,
  ntfy: sendNtfy,
  webhook: sendWebhook,
};

export const enabledChannels = (settings: NotificationSettings): NotificationChannel[] =>
  (Object.keys(SENDERS) as NotificationChannel[]).filter((channel) => settings[channel].enabled);

/**
 * Send to the given channels; never throws, failures are reported per channel
 */
export const deliver = (
  settings: NotificationSettings,
  notification: Notification,
  channels: NotificationChannel[] = enabledChannels(settings),
): Promise<NotificationTestResult[]> =>
  Promise.all(channels.map(async (channel) => {
    try {
      await SENDERS[channel](settings, notification);
      return { channel, ok: true };
    } catch (error) {
      return { channel, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));

/**
 * Send a notification if its event is enabled
 */
export const notify = async (notification: Notification): Promise<void> => {
  const settings = await loadNotificationSettings();
  if (notification.event !== "test" && !settings.events[notification.event]) return;

  const results = await deliver(settings, notification);
  results
    .filter((result) => !result.ok)
    .forEach((result) => console.error(`Notification via ${result.channel} failed: ${result.error}`));
};
