// Stand-ins for `snapraid smart` and `probe` in the demo sandbox (./start.sh --demo).
// Its disks are directories, so SnapRAID finds no device to query. The output below has
// the structured log format of the real commands and goes through the same parsers.
import { parseSnapRaidConfig } from "./config-parser.ts";

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

// One profile per disk in config order, repeated for larger sandboxes:
// a healthy HDD, an SSD, an HDD growing reallocated sectors and a parity disk asleep
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

const demoDisks = async (configPath: string) => {
  const config = await parseSnapRaidConfig(configPath);
  const names = [...Object.keys(config.data), ...config.parity.map((p) => p.keyword)];
  return names.map((name, i) => ({ name, device: `/dev/sd${String.fromCharCode(97 + i)}`, ...PROFILES[i % PROFILES.length] }));
};

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
