import { assertEquals } from "@std/assert";
import { SECRET_MASK, type SnapRaidStatus } from "@shared/types.ts";
import { arraySlugs, arrayState, discoveryMessages, parseCommand } from "../home-assistant.ts";
import {
  DEFAULT_HOME_ASSISTANT_SETTINGS,
  maskHomeAssistantSecrets,
  normalizeHomeAssistantSettings,
} from "../home-assistant-service.ts";
import type { ConfigMetrics } from "../metrics.ts";

const status = (changes: Partial<SnapRaidStatus> = {}): SnapRaidStatus => ({
  hasErrors: false,
  parityUpToDate: true,
  newFiles: 0,
  modifiedFiles: 0,
  deletedFiles: 0,
  disks: [],
  diskIssues: [],
  rawOutput: "",
  ...changes,
});

const config = (changes: Partial<ConfigMetrics> = {}): ConfigMetrics => ({
  name: "Media",
  path: "/cfg/media.conf",
  lastRuns: {
    sync: { timestamp: "2026-10-09T03:10:00.000Z", result: "ok", logFile: "" },
    scrub: { timestamp: "2026-10-08T04:00:00.000Z", result: "error", logFile: "" },
  },
  status: { timestamp: "2026-10-09T08:00:00.000Z", status: status({ scrubPercentage: 42 }) },
  usage: { date: "2026-10-09", usedGB: 3, freeGB: 1, disks: { d1: { usedGB: 3, freeGB: 1 } } },
  smart: { d1: { date: "2026-10-09", temperature: 38 }, parity: { date: "2026-10-09", temperature: 35 } },
  ...changes,
});

Deno.test("arraySlugs - topic-safe and unique", () => {
  assertEquals(arraySlugs(["Media Server", "Fotos & Ärchive", "media server", "!!!"]), [
    "media_server",
    "fotos_archive",
    "media_server_2",
    "array",
  ]);
});

Deno.test("arrayState - health, runs, disks and the running job", () => {
  assertEquals(arrayState(config(), null), {
    health: "ok",
    bad_blocks: 0,
    sync_incomplete: false,
    disks_unavailable: 0,
    scrubbed_percent: 42,
    last_sync: "2026-10-09T03:10:00.000Z",
    last_sync_ok: true,
    last_scrub: "2026-10-08T04:00:00.000Z",
    last_scrub_ok: false,
    job: null,
    disks: { d1: { temperature: 38, used_percent: 75 }, parity: { temperature: 35, used_percent: null } },
  });

  const errors = config({ status: { timestamp: "", status: status({ badBlocks: 3 }) } });
  assertEquals(arrayState(errors, { command: "scrub", configPath: "/cfg/media.conf" }).health, "errors");
  assertEquals(arrayState(errors, { command: "scrub", configPath: "/cfg/media.conf" }).job, "scrub");
  assertEquals(arrayState(errors, { command: "sync", configPath: "/cfg/other.conf" }).job, null);

  const missing = config({
    status: { timestamp: "", status: status({ diskIssues: [{ disk: "d1", type: "data", kind: "empty", path: "/d1", files: 3 }] }) },
  });
  assertEquals(arrayState(missing, null).health, "disk_missing");
  assertEquals(arrayState(config({ status: undefined }), null).health, "unknown");
  assertEquals(arrayState(config({ status: undefined }), null).bad_blocks, null);
});

Deno.test("discoveryMessages - one device, sensors per disk, buttons with the command topic", () => {
  const messages = discoveryMessages(config(), "media", ["d1"], {
    discoveryPrefix: "homeassistant",
    baseTopic: "snapraid-ui",
    version: "",
  });
  const byTopic = Object.fromEntries(messages.map((message) => [message.topic, JSON.parse(message.payload)]));

  const health = byTopic["homeassistant/sensor/snapraid_ui_media/health/config"];
  assertEquals(health.state_topic, "snapraid-ui/media/state");
  assertEquals(health.availability_topic, "snapraid-ui/status");
  assertEquals(health.unique_id, "snapraid_ui_media_health");
  assertEquals(health.device.identifiers, ["snapraid_ui_media"]);
  assertEquals(health.device.name, "SnapRAID Media");
  assertEquals("sw_version" in health.device, false);

  assertEquals(byTopic["homeassistant/sensor/snapraid_ui_media/d1_temperature/config"].device_class, "temperature");
  assertEquals(byTopic["homeassistant/binary_sensor/snapraid_ui_media/problem/config"].device_class, "problem");
  const sync = byTopic["homeassistant/button/snapraid_ui_media/sync/config"];
  assertEquals([sync.command_topic, sync.payload_press, "state_topic" in sync], ["snapraid-ui/media/command", "sync", false]);
  assertEquals(messages.length, 7 + 2 + 2);
});

Deno.test("parseCommand - sync and scrub of an array, nothing else", () => {
  assertEquals(parseCommand("snapraid-ui/media/command", "sync", "snapraid-ui"), { slug: "media", command: "sync" });
  assertEquals(parseCommand("snapraid-ui/media/command", " SCRUB\n", "snapraid-ui"), { slug: "media", command: "scrub" });
  assertEquals(parseCommand("snapraid-ui/media/command", "fix", "snapraid-ui"), null);
  assertEquals(parseCommand("snapraid-ui/a/b/command", "sync", "snapraid-ui"), null);
  assertEquals(parseCommand("other/media/command", "sync", "snapraid-ui"), null);
});

Deno.test("settings - broker address checked, password masked and kept", () => {
  const stored = { ...DEFAULT_HOME_ASSISTANT_SETTINGS, password: "secret" };
  assertEquals(maskHomeAssistantSecrets(stored).password, SECRET_MASK);
  const { settings, error } = normalizeHomeAssistantSettings(
    { enabled: true, url: " mqtt://broker:1883 ", password: SECRET_MASK, baseTopic: "/nas/snapraid/" },
    stored,
  );
  assertEquals(error, undefined);
  assertEquals([settings.url, settings.password, settings.baseTopic], ["mqtt://broker:1883", "secret", "nas/snapraid"]);
  assertEquals(typeof normalizeHomeAssistantSettings({ enabled: true, url: "broker:1883" }, stored).error, "string");
  assertEquals(typeof normalizeHomeAssistantSettings({ baseTopic: "a/#" }, stored).error, "string");
});
