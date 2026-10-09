// Stand-ins for `snapraid smart` and `probe` in the demo sandbox (./start.sh --demo).
// Its disks are directories, so SnapRAID finds no device to query. The output below has
// the structured log format of the real commands and goes through the same parsers.
// The sandbox disks also hold only a few KiB on the host's filesystem: `status` and the
// disk usage get the sizes of the demo disks, so the dashboard looks like a real array.
import type { DataDiskUsage, DeviceInfo, ParityLevelUsage, ParsedSnapRaidConfig } from "@shared/types.ts";
import { parseSnapRaidConfig } from "./config-parser.ts";
import type { DockerRequest } from "./docker.ts";

export const DEMO_MODE = Deno.env.get("SNAPRAID_DEMO") === "1";

interface DemoDisk {
  serial: string;
  family?: string;
  model: string;
  interface: string;
  size: number;          // bytes
  rotationRate: number;  // 0 for SSDs
  temperature: number;
  powerOnHours: number;
  afr: number;           // Annual failure rate and its probability, as SnapRAID computes them
  probability: number;
  flags: number;
  wearLevel?: number;
  reallocated?: number;
  standby?: boolean;
}

// One profile per data disk in config order, repeated for larger sandboxes:
// a healthy HDD, an SSD, an HDD growing reallocated sectors and a big disk asleep
const PROFILES: DemoDisk[] = [
  {
    serial: "WD-WCC7K4DEMO01", family: "Western Digital Red", model: "WDC WD40EFRX-68N32N0",
    interface: "SATA", size: 4000787030016, rotationRate: 5400, temperature: 36,
    powerOnHours: 21873, afr: 0.0456, probability: 0.0446, flags: 0,
  },
  {
    serial: "S6PNNX0DEMO02", model: "Samsung SSD 870 EVO 2TB", interface: "SATA",
    size: 2000398934016, rotationRate: 0, temperature: 33, powerOnHours: 9120,
    afr: 0.0123, probability: 0.0122, flags: 0, wearLevel: 7,
  },
  {
    serial: "ZA1DEMO03", family: "Seagate IronWolf", model: "ST8000VN004-2M2101",
    interface: "SATA", size: 8001563222016, rotationRate: 7200, temperature: 44,
    powerOnHours: 38411, afr: 0.2104, probability: 0.1898, flags: 0, reallocated: 16,
  },
  {
    serial: "ZR5DEMO04", family: "Seagate Exos X16", model: "ST16000NM001G-2KK103",
    interface: "SATA", size: 16000900661248, rotationRate: 7200, temperature: 0,
    powerOnHours: 0, afr: 0, probability: 0, flags: 0, standby: true,
  },
];

// Parity is at least as large as the largest data disk
const PARITY_PROFILE: DemoDisk = {
  serial: "ZL2DEMO05", family: "Seagate Exos X18", model: "ST18000NM000J-2TV103",
  interface: "SATA", size: 18000207937536, rotationRate: 7200, temperature: 38,
  powerOnHours: 12034, afr: 0.0151, probability: 0.015, flags: 0,
};

// How full each data disk is, by config order like PROFILES
const USAGE = [
  { use: 0.69, files: 48213, fragmented: 12 },
  { use: 0.62, files: 61877, fragmented: 3 },
  { use: 0.87, files: 39402, fragmented: 41 },
  { use: 0.53, files: 18650, fragmented: 0 },
];

export const demoDisks = async (configPath: string) => {
  const config = await parseSnapRaidConfig(configPath);
  const data = Object.keys(config.data).map((name, i) => ({ name, ...PROFILES[i % PROFILES.length] }));
  const parity = config.parity.map((p) => ({ name: p.keyword, ...PARITY_PROFILE }));
  return [...data, ...parity].map((d, i) => ({ ...d, device: `/dev/sd${String.fromCharCode(97 + i)}` }));
};

/**
 * Size, used and free bytes of the demo data disks, by name
 */
const demoDataUsage = (config: ParsedSnapRaidConfig) =>
  Object.keys(config.data).map((name, i) => {
    const { size } = PROFILES[i % PROFILES.length];
    const { use, files, fragmented } = USAGE[i % USAGE.length];
    const used = Math.round(size * use);
    return { name, size, used, free: size - used, files, fragmented };
  });

// Scrubbed 64 %, the oldest block 17 days ago: a scrub plan that keeps up
const BLOCKS = 120_000_000;
const UNSCRUBBED = 43_200_000;

/**
 * The structured log of a real `snapraid status` on the sandbox, with the sizes, file counts
 * and scrub state of the demo disks instead of the sandbox's few KiB. Everything else, the
 * disks' paths and the content files, stays as SnapRAID reported it.
 */
export const demoStatusLog = (log: string, config: ParsedSnapRaidConfig): string => {
  const replaced = /^(summary:(disk_|total_|file_count|fragmented_file_count|excess_fragment_count|scrub_)|content_info:block|scrub_graph_)/;
  const kept = log.split("\n").filter((line) => !replaced.test(line));
  const disks = demoDataUsage(config);
  const sum = (key: "used" | "free" | "files" | "fragmented") => disks.reduce((total, d) => total + d[key], 0);
  // Blocks by the day they were last scrubbed (or synced, the "new" ones), oldest first
  const bars = [[17, 9], [14, 10], [11, 9], [8, 10], [5, 9], [3, 9], [1, 8], [0, 0, 36]];
  const lines = [
    `content_info:block:${BLOCKS}`,
    "content_info:block_bad:0",
    "content_info:block_unsynced:0",
    `content_info:block_unscrubbed:${UNSCRUBBED}`,
    ...disks.flatMap((d) => [
      `summary:disk_file_count:${d.name}:${d.files}`,
      `summary:disk_fragmented_file_count:${d.name}:${d.fragmented}`,
      `summary:disk_excess_fragment_count:${d.name}:${d.fragmented * 3}`,
      `summary:disk_space_wasted:${d.name}:0`,
      `summary:disk_used:${d.name}:${d.used}`,
      `summary:disk_free:${d.name}:${d.free}`,
      `summary:disk_use_percent:${d.name}:${Math.round(d.used / d.size * 100)}`,
    ]),
    `summary:file_count:${sum("files")}`,
    `summary:fragmented_file_count:${sum("fragmented")}`,
    `summary:excess_fragment_count:${sum("fragmented") * 3}`,
    "summary:total_wasted:0",
    `summary:total_used:${sum("used")}`,
    `summary:total_free:${sum("free")}`,
    `summary:total_use_percent:${Math.round(sum("used") / (sum("used") + sum("free")) * 100)}`,
    "summary:scrub_oldest_days:17",
    "summary:scrub_median_days:8",
    "summary:scrub_newest_days:0",
    ...bars.map(([daysAgo, scrubbed, fresh = 0], i) =>
      `scrub_graph_bar:${i}:${daysAgo}:${BLOCKS / 100 * scrubbed}:${BLOCKS / 100 * fresh}`
    ),
  ];
  const exit = kept.findIndex((line) => line.startsWith("summary:exit:"));
  if (exit === -1) return [...kept, ...lines].join("\n");
  return [...kept.slice(0, exit), ...lines, ...kept.slice(exit)].join("\n");
};

/**
 * Size and free space of the demo data disks, instead of the host's filesystem
 */
export const demoDataDiskUsage = (config: ParsedSnapRaidConfig): DataDiskUsage[] =>
  demoDataUsage(config).map((d) => ({ name: d.name, totalGB: toGB(d.size), freeGB: toGB(d.free) }));

/**
 * Parity files as large as the fullest data disk, on demo parity disks
 */
export const demoParityUsage = (config: ParsedSnapRaidConfig): ParityLevelUsage[] => {
  const fullest = Math.max(0, ...demoDataUsage(config).map((d) => d.used));
  return config.parity.map(({ level, keyword, paths }) => ({
    level,
    keyword,
    files: paths.map((path, i) => ({
      path,
      // Split parity: the first file holds it all, like a disk the others only extend
      fileSizeGB: toGB(i === 0 ? fullest : 0),
      mount: path.slice(0, path.lastIndexOf("/")) || "/",
      diskTotalGB: toGB(PARITY_PROFILE.size),
      diskFreeGB: toGB(i === 0 ? PARITY_PROFILE.size - fullest : PARITY_PROFILE.size),
    })),
    capacityGB: toGB(PARITY_PROFILE.size * paths.length),
  }));
};

const toGB = (bytes: number): number => Math.round(bytes / 1e9 * 10) / 10;

const smartLines = (d: DemoDisk & { name: string; device: string }): string[] => {
  const tag = `${d.device}:${d.name}`;
  const lines = [
    `info:${tag}`,
    `attr:${tag}:serial:${d.serial}`,
    ...(d.family ? [`attr:${tag}:family:${d.family}`] : []),
    `attr:${tag}:model:${d.model}`,
    `attr:${tag}:interface:${d.interface}`,
    `attr:${tag}:size:${d.size}`,
    `attr:${tag}:rotationrate:${d.rotationRate}`,
  ];
  // smartctl leaves a sleeping disk alone, so there is nothing more to report
  if (d.standby) return [...lines, `attr:${tag}:power:standby`];

  const hex = (n: number) => n.toString(16);
  const reallocated = d.reallocated ?? 0;
  return [
    ...lines,
    `smart:${tag}`,
    `attr:${tag}:error_protocol:0`,
    `attr:${tag}:error_medium:0`,
    ...(d.wearLevel !== undefined ? [`attr:${tag}:wear_level:${d.wearLevel}`] : []),
    `attr:${tag}:flags:${d.flags}:${hex(d.flags)}`,
    `attr:${tag}:afr:${d.afr}:${d.probability}`,
    `attr:${tag}:5:${reallocated}:${hex(reallocated)}:${reallocated ? 98 : 100}:${reallocated ? 98 : 100}:10:Reallocated_Sector_Ct:prefail:always:never`,
    `attr:${tag}:9:${d.powerOnHours}:${hex(d.powerOnHours)}:${100 - Math.floor(d.powerOnHours / 1000)}:${100 - Math.floor(d.powerOnHours / 1000)}:0:Power_On_Hours:oldage:always:never`,
    `attr:${tag}:194:${d.temperature}:${hex(d.temperature)}:${100 - d.temperature}:${90 - d.temperature}:0:Temperature_Celsius:oldage:always:never`,
    `attr:${tag}:197:0:0:100:100:0:Current_Pending_Sector:oldage:always:never`,
    `attr:${tag}:199:0:0:200:200:0:UDMA_CRC_Error_Count:oldage:always:never`,
    `attr:${tag}:temperature:${d.temperature}`,
  ];
};

/**
 * Structured log of `snapraid smart` for the disks of the given config
 */
export const demoSmartLog = async (configPath: string): Promise<string> => {
  const disks = await demoDisks(configPath);
  const awake = disks.filter((d) => !d.standby);
  const afr = awake.reduce((sum, d) => sum + d.afr, 0);
  return [
    "command:smart",
    ...disks.flatMap(smartLines),
    `summary:array_failure:${afr.toFixed(4)}:${(1 - Math.exp(-afr)).toFixed(4)}`,
  ].join("\n");
};

/**
 * Structured log of `snapraid probe`: power 0 = standby, 1 = active
 */
export const demoProbeLog = async (configPath: string): Promise<string> =>
  ["command:probe", ...(await demoDisks(configPath)).map((d) => `probe:${d.device}:${d.name}:${d.standby ? 0 : 1}`)]
    .join("\n");

/**
 * Devices of the demo disks for the spindown, as `snapraid devices` lists them
 */
export const demoDevices = async (configPath: string): Promise<DeviceInfo[]> =>
  (await demoDisks(configPath)).map((d, i) => ({
    majorMinor: `8:${i * 16}`,
    device: d.device,
    partMajorMinor: `8:${i * 16 + 1}`,
    partition: `${d.device}1`,
    diskName: d.name,
  }));

/**
 * /proc/diskstats for the demo devices: the first disk is busy, the others are quiet
 */
export const demoDiskstats = (devices: DeviceInfo[]): string =>
  devices.map((device, i) => {
    const [major, minor] = device.partMajorMinor.split(":");
    const reads = i === 0 ? Math.floor(Date.now() / 60_000) : 1000 + i;
    return `${major} ${minor} ${device.partition.replace("/dev/", "")} ${reads} 0 0 0 500 0 0 0 0 0 0`;
  }).join("\n");

// Containers of a typical home server, for the pause during jobs
const containers = [
  { Id: "a3f1c9e2d4b5".padEnd(64, "0"), Names: ["/immich"], Image: "ghcr.io/immich-app/immich-server:release", State: "running" },
  { Id: "b7e2d1f0c9a8".padEnd(64, "0"), Names: ["/jellyfin"], Image: "jellyfin/jellyfin:10.10", State: "running" },
  { Id: "c4d9a7b3e1f2".padEnd(64, "0"), Names: ["/nextcloud"], Image: "nextcloud:31-apache", State: "running" },
];

/**
 * The Docker Engine API for the demo: lists its containers, pauses and resumes them
 */
export const demoDocker: DockerRequest = (method, path) => {
  const json = (body: unknown) => Promise.resolve({ status: 200, body: JSON.stringify(body) });
  if (method === "GET" && path.startsWith("/containers/json")) return json(containers);
  const [, name, action] = path.match(/^\/containers\/([^/]+)\/(json|pause|unpause)$/) ?? [];
  const container = containers.find((c) => c.Names[0] === `/${decodeURIComponent(name ?? "")}`);
  if (!container) return Promise.resolve({ status: 404, body: JSON.stringify({ message: `No such container: ${name}` }) });
  if (action === "json") return json({ Id: container.Id, State: { Status: container.State } });
  container.State = action === "pause" ? "paused" : "running";
  return Promise.resolve({ status: 204, body: "" });
};
