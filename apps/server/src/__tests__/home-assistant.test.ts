import { expect, test } from "bun:test";
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

test("arraySlugs - topic-safe and unique", () => {
  expect(arraySlugs(["Media Server", "Fotos & Ärchive", "media server", "!!!"])).toEqual([
    "media_server",
    "fotos_archive",
    "media_server_2",
    "array",
  ]);
});

test("arrayState - health, runs, disks and the running job", () => {
  expect(arrayState(config(), null)).toEqual({
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
  expect(arrayState(errors, { command: "scrub", configPath: "/cfg/media.conf" }).health).toEqual("errors");
  expect(arrayState(errors, { command: "scrub", configPath: "/cfg/media.conf" }).job).toEqual("scrub");
  expect(arrayState(errors, { command: "sync", configPath: "/cfg/other.conf" }).job).toEqual(null);

  const missing = config({
    status: { timestamp: "", status: status({ diskIssues: [{ disk: "d1", type: "data", kind: "empty", path: "/d1", files: 3 }] }) },
  });
  expect(arrayState(missing, null).health).toEqual("disk_missing");
  expect(arrayState(config({ status: undefined }), null).health).toEqual("unknown");
  expect(arrayState(config({ status: undefined }), null).bad_blocks).toEqual(null);
});

test("discoveryMessages - one device, sensors per disk, buttons with the command topic", () => {
  const messages = discoveryMessages(config(), "media", ["d1"], {
    discoveryPrefix: "homeassistant",
    baseTopic: "snapraid-ui",
    version: "",
  });
  const byTopic = Object.fromEntries(messages.map((message) => [message.topic, JSON.parse(message.payload)]));

  const health = byTopic["homeassistant/sensor/snapraid_ui_media/health/config"];
  expect(health.state_topic).toEqual("snapraid-ui/media/state");
  expect(health.availability_topic).toEqual("snapraid-ui/status");
  expect(health.unique_id).toEqual("snapraid_ui_media_health");
  expect(health.device.identifiers).toEqual(["snapraid_ui_media"]);
  expect(health.device.name).toEqual("SnapRAID Media");
  expect("sw_version" in health.device).toEqual(false);

  expect(byTopic["homeassistant/sensor/snapraid_ui_media/d1_temperature/config"].device_class).toEqual("temperature");
  expect(byTopic["homeassistant/binary_sensor/snapraid_ui_media/problem/config"].device_class).toEqual("problem");
  const sync = byTopic["homeassistant/button/snapraid_ui_media/sync/config"];
  expect([sync.command_topic, sync.payload_press, "state_topic" in sync]).toEqual(["snapraid-ui/media/command", "sync", false]);
  expect(messages.length).toEqual(7 + 2 + 2);
});

test("parseCommand - sync and scrub of an array, nothing else", () => {
  expect(parseCommand("snapraid-ui/media/command", "sync", "snapraid-ui")).toEqual({ slug: "media", command: "sync" });
  expect(parseCommand("snapraid-ui/media/command", " SCRUB\n", "snapraid-ui")).toEqual({ slug: "media", command: "scrub" });
  expect(parseCommand("snapraid-ui/media/command", "fix", "snapraid-ui")).toEqual(null);
  expect(parseCommand("snapraid-ui/a/b/command", "sync", "snapraid-ui")).toEqual(null);
  expect(parseCommand("other/media/command", "sync", "snapraid-ui")).toEqual(null);
});

test("settings - broker address checked, password masked and kept", () => {
  const stored = { ...DEFAULT_HOME_ASSISTANT_SETTINGS, password: "secret" };
  expect(maskHomeAssistantSecrets(stored).password).toEqual(SECRET_MASK);
  const { settings, error } = normalizeHomeAssistantSettings(
    { enabled: true, url: " mqtt://broker:1883 ", password: SECRET_MASK, baseTopic: "/nas/snapraid/" },
    stored,
  );
  expect(error).toEqual(undefined);
  expect([settings.url, settings.password, settings.baseTopic]).toEqual(["mqtt://broker:1883", "secret", "nas/snapraid"]);
  expect(typeof normalizeHomeAssistantSettings({ enabled: true, url: "broker:1883" }, stored).error).toEqual("string");
  expect(typeof normalizeHomeAssistantSettings({ baseTopic: "a/#" }, stored).error).toEqual("string");
});
