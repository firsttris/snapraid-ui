// Home Assistant over MQTT. Each array becomes a device through MQTT discovery, with sensors
// for its health, last sync and scrub, bad blocks, and the temperature and fill level of its
// disks, binary sensors for problems and a running job, and buttons for sync and scrub.
// The values come from the array snapshot, publishing never wakes a disk.
import type { ConfigMetrics } from "./metrics.ts";
import { blockingIssues } from "./disk-check.ts";
import { isSuccessful } from "./run-report.ts";

export type ArrayHealth = "ok" | "errors" | "disk_missing" | "sync_incomplete" | "unknown";

export interface ArrayState {
  health: ArrayHealth;
  bad_blocks: number | null;
  sync_incomplete: boolean | null;
  disks_unavailable: number | null;
  scrubbed_percent: number | null;
  last_sync: string | null;
  last_sync_ok: boolean | null;
  last_scrub: string | null;
  last_scrub_ok: boolean | null;
  job: string | null;
  disks: Record<string, { temperature: number | null; used_percent: number | null }>;
}

export interface MqttMessage {
  topic: string;
  payload: string;
}

export const HA_COMMANDS = ["sync", "scrub"] as const;
export type HaCommand = typeof HA_COMMANDS[number];

/**
 * Topic-safe id of an array, unique among the arrays: "Media Server" -> "media_server"
 */
export const arraySlugs = (names: string[]): string[] => {
  const used = new Map<string, number>();
  return names.map((name) => {
    const base = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "array";
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
};

const healthOf = (config: ConfigMetrics): ArrayHealth => {
  const status = config.status?.status;
  if (!status) return "unknown";
  if (blockingIssues(status.diskIssues ?? []).length > 0) return "disk_missing";
  if ((status.badBlocks ?? 0) > 0 || status.hasErrors) return "errors";
  if (status.syncIncomplete) return "sync_incomplete";
  return "ok";
};

export const arrayState = (config: ConfigMetrics, job: { command: string; configPath: string } | null): ArrayState => {
  const status = config.status?.status;
  const disks: ArrayState["disks"] = {};
  for (const [disk, usage] of Object.entries(config.usage?.disks ?? {})) {
    const total = usage.usedGB + usage.freeGB;
    disks[disk] = { temperature: null, used_percent: total > 0 ? Math.round((usage.usedGB / total) * 100) : null };
  }
  for (const [disk, point] of Object.entries(config.smart)) {
    disks[disk] = { used_percent: disks[disk]?.used_percent ?? null, temperature: point?.temperature ?? null };
  }
  const run = (command: "sync" | "scrub") => config.lastRuns?.[command];
  return {
    health: healthOf(config),
    bad_blocks: status ? status.badBlocks ?? 0 : null,
    sync_incomplete: status ? !!status.syncIncomplete : null,
    disks_unavailable: status ? blockingIssues(status.diskIssues ?? []).length : null,
    scrubbed_percent: status?.scrubPercentage ?? null,
    last_sync: run("sync")?.timestamp ?? null,
    last_sync_ok: run("sync") ? isSuccessful(run("sync")!.result) : null,
    last_scrub: run("scrub")?.timestamp ?? null,
    last_scrub_ok: run("scrub") ? isSuccessful(run("scrub")!.result) : null,
    job: job && job.configPath === config.path ? job.command : null,
    disks,
  };
};

export interface DiscoveryOptions {
  discoveryPrefix: string;
  baseTopic: string;
  version: string;
}

export const availabilityTopic = (baseTopic: string) => `${baseTopic}/status`;
export const stateTopic = (baseTopic: string, slug: string) => `${baseTopic}/${slug}/state`;
export const commandTopic = (baseTopic: string, slug: string) => `${baseTopic}/${slug}/command`;

/**
 * Discovery config messages (retained) of one array: one per entity
 */
export const discoveryMessages = (
  config: ConfigMetrics,
  slug: string,
  disks: string[],
  { discoveryPrefix, baseTopic, version }: DiscoveryOptions,
): MqttMessage[] => {
  const device = {
    identifiers: [`snapraid_ui_${slug}`],
    name: `SnapRAID ${config.name}`,
    manufacturer: "SnapRAID UI",
    model: "SnapRAID array",
    ...(version ? { sw_version: version } : {}),
  };
  const common = {
    availability_topic: availabilityTopic(baseTopic),
    device,
    origin: {
      name: "SnapRAID UI",
      ...(version ? { sw_version: version } : {}),
      support_url: "https://github.com/firsttris/snapraid-ui",
    },
  };
  const entity = (component: string, object: string, config: Record<string, unknown>): MqttMessage => ({
    topic: `${discoveryPrefix}/${component}/snapraid_ui_${slug}/${object}/config`,
    payload: JSON.stringify({
      ...common,
      unique_id: `snapraid_ui_${slug}_${object}`,
      object_id: `snapraid_${slug}_${object}`,
      ...(component === "button" ? {} : { state_topic: stateTopic(baseTopic, slug) }),
      ...config,
    }),
  });

  return [
    entity("sensor", "health", { name: "Health", icon: "mdi:harddisk", value_template: "{{ value_json.health }}" }),
    entity("binary_sensor", "problem", {
      name: "Problem",
      device_class: "problem",
      value_template: "{{ 'ON' if value_json.health not in ['ok', 'unknown'] else 'OFF' }}",
    }),
    entity("binary_sensor", "running", {
      name: "Job running",
      device_class: "running",
      value_template: "{{ 'ON' if value_json.job else 'OFF' }}",
    }),
    entity("sensor", "bad_blocks", {
      name: "Bad blocks",
      icon: "mdi:alert-octagon",
      state_class: "measurement",
      value_template: "{{ value_json.bad_blocks }}",
    }),
    entity("sensor", "last_sync", { name: "Last sync", device_class: "timestamp", value_template: "{{ value_json.last_sync }}" }),
    entity("sensor", "last_scrub", { name: "Last scrub", device_class: "timestamp", value_template: "{{ value_json.last_scrub }}" }),
    entity("sensor", "scrubbed", {
      name: "Scrubbed",
      unit_of_measurement: "%",
      state_class: "measurement",
      icon: "mdi:magnify-scan",
      value_template: "{{ value_json.scrubbed_percent }}",
    }),
    ...disks.flatMap((disk) => [
      entity("sensor", `${disk}_temperature`, {
        name: `${disk} temperature`,
        device_class: "temperature",
        unit_of_measurement: "°C",
        state_class: "measurement",
        value_template: `{{ value_json.disks['${disk}'].temperature if '${disk}' in value_json.disks else None }}`,
      }),
      entity("sensor", `${disk}_used`, {
        name: `${disk} used`,
        unit_of_measurement: "%",
        state_class: "measurement",
        icon: "mdi:chart-donut",
        value_template: `{{ value_json.disks['${disk}'].used_percent if '${disk}' in value_json.disks else None }}`,
      }),
    ]),
    ...HA_COMMANDS.map((command) =>
      entity("button", command, {
        name: command === "sync" ? "Sync" : "Scrub",
        icon: command === "sync" ? "mdi:sync" : "mdi:magnify-scan",
        command_topic: commandTopic(baseTopic, slug),
        payload_press: command,
      })
    ),
  ];
};

/**
 * The array and command of a message on <baseTopic>/<slug>/command, null for anything else
 */
export const parseCommand = (
  topic: string,
  payload: string,
  baseTopic: string,
): { slug: string; command: HaCommand } | null => {
  if (!topic.startsWith(`${baseTopic}/`) || !topic.endsWith("/command")) return null;
  const slug = topic.slice(baseTopic.length + 1, -"/command".length);
  const command = payload.trim().toLowerCase();
  if (!slug || slug.includes("/") || !(HA_COMMANDS as readonly string[]).includes(command)) return null;
  return { slug, command: command as HaCommand };
};
