// The MQTT connection to Home Assistant: publishes discovery and state, runs the buttons' commands
import mqtt, { type MqttClient } from "mqtt";
import { existsSync } from "@std/fs";
import { type HomeAssistantSettings, type HomeAssistantStatus, SECRET_MASK } from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";
import type { ConfigMetrics } from "./metrics.ts";
import {
  arraySlugs,
  arrayState,
  availabilityTopic,
  discoveryMessages,
  type HaCommand,
  type MqttMessage,
  parseCommand,
} from "./home-assistant.ts";

const SETTINGS_FILE = "home-assistant.json";
// State is checked this often and published when it changed, and at least every few minutes
const PUBLISH_INTERVAL_MS = 30_000;
const REPUBLISH_MS = 5 * 60_000;
const JOB_CHECK_MS = 5_000;
const CONNECT_TIMEOUT_MS = 10_000;

export const DEFAULT_HOME_ASSISTANT_SETTINGS: HomeAssistantSettings = {
  enabled: false,
  url: "",
  username: "",
  password: "",
  discoveryPrefix: "homeassistant",
  baseTopic: "snapraid-ui",
};

const settingsPath = () => resolveFromBase(SETTINGS_FILE);

const withDefaults = (stored: Partial<HomeAssistantSettings>): HomeAssistantSettings => ({
  ...DEFAULT_HOME_ASSISTANT_SETTINGS,
  ...stored,
});

export const loadHomeAssistantSettings = async (): Promise<HomeAssistantSettings> => {
  if (!existsSync(settingsPath())) return DEFAULT_HOME_ASSISTANT_SETTINGS;
  try {
    return withDefaults(JSON.parse(await Deno.readTextFile(settingsPath())));
  } catch (error) {
    console.error(`Failed to read ${settingsPath()}, Home Assistant is off:`, error);
    return DEFAULT_HOME_ASSISTANT_SETTINGS;
  }
};

export const saveHomeAssistantSettings = async (settings: HomeAssistantSettings): Promise<void> => {
  // Holds the broker password
  await Deno.writeTextFile(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
};

export const maskHomeAssistantSecrets = (settings: HomeAssistantSettings): HomeAssistantSettings => ({
  ...settings,
  password: settings.password ? SECRET_MASK : "",
});

/**
 * Settings from the browser, cleaned up; a masked password keeps the stored one
 */
export const normalizeHomeAssistantSettings = (
  incoming: Partial<HomeAssistantSettings>,
  stored: HomeAssistantSettings,
): { settings: HomeAssistantSettings; error?: string } => {
  const merged = withDefaults(incoming);
  const settings: HomeAssistantSettings = {
    ...merged,
    url: merged.url.trim(),
    username: merged.username.trim(),
    password: merged.password === SECRET_MASK ? stored.password : merged.password,
    discoveryPrefix: merged.discoveryPrefix.trim().replace(/^\/+|\/+$/g, "") || "homeassistant",
    baseTopic: merged.baseTopic.trim().replace(/^\/+|\/+$/g, "") || "snapraid-ui",
  };
  if (settings.enabled && !/^(mqtts?|wss?):\/\/[^/]+/.test(settings.url)) {
    return { settings, error: "The broker address must start with mqtt://, mqtts://, ws:// or wss://" };
  }
  if (/[#+]/.test(settings.baseTopic) || /[#+]/.test(settings.discoveryPrefix)) {
    return { settings, error: "Topics must not contain + or #" };
  }
  return { settings };
};

const connectOptions = (settings: HomeAssistantSettings) => ({
  username: settings.username || undefined,
  password: settings.password || undefined,
  clientId: `snapraid-ui-${crypto.randomUUID().slice(0, 8)}`,
  connectTimeout: CONNECT_TIMEOUT_MS,
  reconnectPeriod: 10_000,
  will: { topic: availabilityTopic(settings.baseTopic), payload: "offline", retain: true, qos: 1 as const },
});

/**
 * Connect once and disconnect, to check address and credentials
 */
export const testHomeAssistantConnection = async (settings: HomeAssistantSettings): Promise<string | null> => {
  try {
    const client = await mqtt.connectAsync(settings.url, { ...connectOptions(settings), reconnectPeriod: 0 });
    await client.endAsync();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export interface HomeAssistantDeps {
  snapshot: () => Promise<ConfigMetrics[]>;
  currentJob: () => { command: string; configPath: string } | null;
  lastJobFinishedAt: () => string | undefined; // A job that started and ended between two checks
  runCommand: (configPath: string, command: HaCommand) => Promise<void>;
  version: string;
}

export const createHomeAssistant = (deps: HomeAssistantDeps) => {
  let client: MqttClient | null = null;
  let settings = DEFAULT_HOME_ASSISTANT_SETTINGS;
  let timer: ReturnType<typeof setInterval> | undefined;
  let status: HomeAssistantStatus = { connected: false };
  let published = new Map<string, string>(); // Retained topics and what was last sent
  let lastFullPublish = 0;
  let slugToPath = new Map<string, string>();
  let publishing = false;

  const publish = (message: MqttMessage) =>
    new Promise<void>((resolve) => client?.publish(message.topic, message.payload, { retain: true, qos: 1 }, () => resolve()) ?? resolve());

  /**
   * Discovery and state of all arrays; only what changed, unless `force`. Entities of arrays or
   * disks that went away are removed with an empty retained message.
   */
  const publishAll = async (force = false) => {
    if (!client?.connected || publishing) return;
    publishing = true;
    try {
      const configs = await deps.snapshot();
      const slugs = arraySlugs(configs.map((config) => config.name));
      const job = deps.currentJob();
      const messages: MqttMessage[] = [{ topic: availabilityTopic(settings.baseTopic), payload: "online" }];
      slugToPath = new Map();
      configs.forEach((config, index) => {
        const slug = slugs[index];
        slugToPath.set(slug, config.path);
        const state = arrayState(config, job);
        messages.push(...discoveryMessages(config, slug, Object.keys(state.disks), {
          discoveryPrefix: settings.discoveryPrefix,
          baseTopic: settings.baseTopic,
          version: deps.version,
        }));
        messages.push({ topic: `${settings.baseTopic}/${slug}/state`, payload: JSON.stringify(state) });
      });

      const full = force || Date.now() - lastFullPublish > REPUBLISH_MS;
      const current = new Map(messages.map((message) => [message.topic, message.payload]));
      for (const message of messages) {
        if (full || published.get(message.topic) !== message.payload) await publish(message);
      }
      for (const topic of published.keys()) {
        if (!current.has(topic) && topic.includes("/config")) await publish({ topic, payload: "" });
      }
      published = current;
      if (full) lastFullPublish = Date.now();
      status = { ...status, publishedAt: new Date().toISOString() };
    } catch (error) {
      console.error("Home Assistant publish failed:", error);
    } finally {
      publishing = false;
    }
  };

  const handleMessage = async (topic: string, payload: Uint8Array) => {
    const text = new TextDecoder().decode(payload);
    // Home Assistant restarted: it needs the discovery again
    if (topic === `${settings.discoveryPrefix}/status` && text === "online") {
      await publishAll(true);
      return;
    }
    const command = parseCommand(topic, text, settings.baseTopic);
    const configPath = command && slugToPath.get(command.slug);
    if (!command || !configPath) return;
    try {
      await deps.runCommand(configPath, command.command);
    } catch (error) {
      console.error(`Home Assistant ${command.command} of ${command.slug} not started:`, error);
    }
    await publishAll();
  };

  const stop = async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (client) {
      const closing = client;
      client = null;
      // Offline on purpose: the will is only sent when the connection drops
      await new Promise<void>((resolve) =>
        closing.publish(availabilityTopic(settings.baseTopic), "offline", { retain: true, qos: 1 }, () => resolve())
      ).catch(() => {});
      await closing.endAsync().catch(() => {});
    }
    published = new Map();
    status = { connected: false };
  };

  /**
   * (Re)connect with the stored settings, or stay off
   */
  const start = async () => {
    await stop();
    settings = await loadHomeAssistantSettings();
    if (!settings.enabled || !settings.url) return;

    client = mqtt.connect(settings.url, connectOptions(settings));
    client.on("connect", () => {
      status = { connected: true, publishedAt: status.publishedAt };
      client?.subscribe([`${settings.baseTopic}/+/command`, `${settings.discoveryPrefix}/status`], { qos: 1 });
      void publishAll(true);
    });
    client.on("close", () => {
      status = { ...status, connected: false };
    });
    client.on("error", (error) => {
      status = { ...status, connected: false, error: error.message };
    });
    client.on("message", (topic, payload) => void handleMessage(topic, payload));
    // The full state every 30 seconds, a started or finished job right away
    let ticks = 0;
    let lastJob = "";
    timer = setInterval(() => {
      const job = deps.currentJob();
      const jobKey = `${job ? `${job.command}|${job.configPath}` : ""}|${deps.lastJobFinishedAt() ?? ""}`;
      ticks++;
      if (jobKey !== lastJob || ticks * JOB_CHECK_MS >= PUBLISH_INTERVAL_MS) {
        lastJob = jobKey;
        ticks = 0;
        void publishAll();
      }
    }, JOB_CHECK_MS);
  };

  return {
    start,
    stop,
    status: () => status,
  };
};

export type HomeAssistant = ReturnType<typeof createHomeAssistant>;
