// Gives the demo sandbox a past, run by dev/setup.sh after its real SnapRAID jobs:
//   - the job logs (logs/run-<n>-<command>.log, in the order they ran) move back in time, so
//     the dashboard shows the last sync and scrub, and the Logs page a history
//   - usage-history.json: two months of disk usage, one disk filling up
//   - schedules.json: a nightly sync with touch and scrub, a weekly scrub, a SMART check
//   - maintenance.json: Docker pause and spindown, on the demo's own containers and disks
//
// deno run --config backend/deno.json --allow-read --allow-write dev/seed-demo.ts <sandbox>
import { Cron } from "@hexagon/croner";
import { join } from "@std/path";
import type { MaintenanceSettings, Schedule, UsagePoint } from "@shared/types.ts";
import { parseSnapRaidConfig } from "../backend/src/config-parser.ts";
import { demoDataDiskUsage } from "../backend/src/demo.ts";

const sandbox = Deno.args[0];
if (!sandbox) throw new Error("Usage: seed-demo.ts <sandbox>");
const confPath = join(sandbox, "snapraid.conf");
const logs = join(sandbox, "logs");

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// When each job started (before now) and how long it ran, in the order setup.sh ran them
const RUNS: Record<string, { ago: number; seconds: number }> = {
  "1-sync": { ago: 8 * DAY + 3 * HOUR, seconds: 872 },
  "2-scrub": { ago: 31 * HOUR, seconds: 3130 },
  "3-touch": { ago: 10 * HOUR + 2 * 60_000, seconds: 18 },
  "4-sync": { ago: 10 * HOUR, seconds: 401 },
  "5-diff": { ago: 2 * HOUR, seconds: 42 },
  "6-status": { ago: HOUR, seconds: 3 },
};

const pad = (n: number) => String(n).padStart(2, "0");
// The log manager's file name: <command>-YYYYMMDD-HHMMSS.log in UTC
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

for await (const entry of Deno.readDir(logs)) {
  const run = entry.name.match(/^run-(\d-[a-z]+)\.log$/)?.[1];
  if (!run || !RUNS[run]) continue;
  const { ago, seconds } = RUNS[run];
  const start = new Date(now - ago);
  const file = join(logs, `${run.slice(2)}-${stamp(start)}.log`);
  const unixtime = Math.floor(start.getTime() / 1000);
  const time = start.toISOString().slice(0, 19).replace("T", " ");
  const log = (await Deno.readTextFile(join(logs, entry.name)))
    .replace(/^unixtime:\d+$/m, `unixtime:${unixtime}`)
    .replace(/^time:.*$/m, `time:${time}`);
  await Deno.writeTextFile(file, log);
  await Deno.remove(join(logs, entry.name));
  // The Logs page shows how long a job ran: from the name's start to the file's last change
  const end = new Date(start.getTime() + seconds * 1000);
  await Deno.utime(file, end, end);
}

// Two months of usage: one disk fills up by about 7 GB a day, the others grow slowly.
// Today's point comes from the first status read, from the same demo figures.
const config = await parseSnapRaidConfig(confPath);
const disks = demoDataDiskUsage(config);
const growthPerDay = [2, 1, 6.8, 0.5];
const history: UsagePoint[] = [];
for (let daysAgo = 60; daysAgo >= 1; daysAgo--) {
  const perDisk = disks.map((d, i) => {
    const freeGB = Math.round((d.freeGB! + growthPerDay[i % growthPerDay.length] * daysAgo) * 10) / 10;
    return [d.name, { usedGB: Math.round((d.totalGB! - freeGB) * 10) / 10, freeGB }] as const;
  });
  history.push({
    date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10),
    usedGB: Math.round(perDisk.reduce((sum, [, d]) => sum + d.usedGB, 0) * 10) / 10,
    freeGB: Math.round(perDisk.reduce((sum, [, d]) => sum + d.freeGB, 0) * 10) / 10,
    disks: Object.fromEntries(perDisk),
  });
}
// Keyed like the backend keys it: the config path resolved against SNAPRAID_BASE_PATH
await Deno.writeTextFile(join(sandbox, "usage-history.json"), JSON.stringify({ [confPath]: history }));

const iso = (ms: number) => new Date(ms).toISOString();
const created = iso(now - 30 * DAY);
const schedule = (fields: Omit<Schedule, "nextRun" | "createdAt" | "updatedAt" | "configPath">): Schedule => ({
  ...fields,
  configPath: "snapraid.conf",
  nextRun: new Cron(fields.cronExpression).nextRun()?.toISOString(),
  createdAt: created,
  updatedAt: created,
});
const lastSync = iso(now - RUNS["4-sync"].ago);
const schedules: Schedule[] = [
  schedule({
    id: crypto.randomUUID(),
    name: "Nightly sync",
    command: "sync",
    cronExpression: "0 3 * * *",
    enabled: true,
    maxDeletedFiles: 50,
    touchBefore: true,
    scrubAfter: [],
    lastRun: lastSync,
    lastOutcome: {
      timestamp: lastSync,
      result: "ok",
      steps: [{ command: "touch", result: "ok" }, { command: "sync", result: "ok" }, { command: "scrub", result: "ok" }],
    },
  }),
  schedule({
    id: crypto.randomUUID(),
    name: "Weekly scrub",
    command: "scrub",
    args: ["-p", "12", "-o", "10"],
    cronExpression: "0 5 * * 0",
    enabled: true,
    lastRun: iso(now - RUNS["2-scrub"].ago),
    lastOutcome: { timestamp: iso(now - RUNS["2-scrub"].ago), result: "ok" },
  }),
  schedule({
    id: crypto.randomUUID(),
    name: "SMART check",
    command: "smart",
    cronExpression: "0 8 * * *",
    enabled: true,
  }),
];
await Deno.writeTextFile(join(sandbox, "schedules.json"), JSON.stringify({ schedules }, null, 2));

// The demo answers for Docker itself (backend/src/demo.ts), spindown watches the demo disks
const maintenance: MaintenanceSettings = {
  dockerPause: {
    enabled: true,
    socketPath: "/var/run/docker.sock",
    containers: ["immich", "nextcloud"],
    commands: ["sync", "scrub"],
  },
  spindown: { enabled: true, idleMinutes: 30 },
};
await Deno.writeTextFile(join(sandbox, "maintenance.json"), JSON.stringify(maintenance, null, 2));

console.log("Seeded the job history, disk usage, schedules and automation");
