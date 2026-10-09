// The daemon engine against a stand-in for snapraid-daemon 2.0rc2. The responses follow
// what a real daemon answered (fields trimmed); a task advances one step per poll.
import { assert, assertEquals, assertRejects } from "@std/assert";
import type { JobProgress } from "@shared/types.ts";
import { EngineBusyError } from "../engine/engine.ts";
import {
  createDaemonEngine,
  type DaemonArray,
  type DaemonDevice,
  type DaemonDisks,
  DaemonError,
  diffSucceeded,
  toDiffReport,
  toLastRuns,
  toPowerStates,
  toRunReport,
  toSmartDisks,
  toStatus,
} from "../engine/daemon-engine.ts";
import { assessSmart } from "@shared/smart-health.ts";
import { createFakeEngine } from "./fake-engine.ts";

const ARRAY: DaemonArray = {
  health: "passed",
  engine_conf: "/etc/snapraid.conf",
  files_count: 1204,
  total_space_bytes: 8_000_000_000_000,
  free_space_bytes: 3_000_000_000_000,
  blocks_bad: 0,
  blocks_unsynced: 0,
  blocks_unscrubbed: 25,
  blocks_count: 100,
  failure_probability: 0.1898,
  diff_equal: 2,
  diff_added: 1,
  diff_removed: 1,
  diff_updated: 0,
  diff_moved: 0,
  diff_copied: 0,
  diff_relocated: 1,
  diff_restored: 0,
  diffs: [
    { change: "removed", disk: "d1", path: "photo.jpg" },
    { change: "added", disk: "d2", path: "new-file.txt" },
    { change: "relocated", disk: "d2", path: "movies/a.mkv" },
  ],
  scrub_history: {
    x_axis_low: 0,
    x_axis_high: 42,
    x_axis_median: 7,
    points: [{ ago: 0, scrubbed: 0, new: 75 }, { ago: 0, scrubbed: 0, new: 0 }],
  },
};

const DEVICE: DaemonDevice = {
  node: "/dev/sda",
  power: "active",
  family: "Seagate IronWolf",
  model: "ST8000VN004-2M2101",
  serial: "ZA1DEMO03",
  interface: "SATA",
  size_bytes: 8001563222016,
  rotational: 7200,
  error_protocol: 0,
  error_medium: 0,
  failure_probability: 0.0446,
  smart: {
    power_on_hours: 38411,
    temperature_celsius: 44,
    failing: false,
    prefail: false,
    attributes: [
      { name: "Reallocated_Sector_Ct", type: "prefail", when_failed: "never", raw: { value: 16 }, norm: { value: 98 }, worst: 98, thresh: 10 },
      { name: "Power_On_Hours", type: "oldage", when_failed: "never", raw: { value: 38411 }, norm: { value: 62 }, worst: 62, thresh: 0 },
    ],
  },
};

const DISKS: DaemonDisks = {
  data_disks: [
    { name: "d1", health: "passed", total_space_bytes: 4e12, free_space_bytes: 1e12, splits: [{ path: "/mnt/disk1/" }], devices: [DEVICE] },
    { name: "d2", health: "degraded", total_space_bytes: 4e12, free_space_bytes: 2e12, splits: [{ path: "/mnt/disk2/" }], devices: [] },
  ],
  parity_disks: [
    { name: "parity", health: "passed", splits: [{ path: "/mnt/parity1/snapraid.parity" }], devices: [{ node: "/dev/sdd", power: "standby" }] },
  ],
};

interface Task {
  number: number;
  command: string;
  status: string;
  exit_code?: number;
  progress?: number;
  size_done_bytes?: number;
  eta_seconds?: number;
  log_file?: string;
  error_io?: number;
  error_data?: number;
  messages: Array<{ level: string; text: string }>;
}

/**
 * A daemon stand-in: scheduled tasks go queued -> processing (50 %) -> terminated, one step per /v1/tasks poll
 */
const fakeDaemon = (options: { exitCode?: Record<string, number>; auth?: string } = {}) => {
  const requests: string[] = [];
  const history: Task[] = [{ number: 4, command: "read", status: "terminated", exit_code: 0, messages: [] }];
  let active: Task | null = null;
  let stopped = false;

  const advance = () => {
    if (!active) return;
    if (active.status === "queued") {
      active.status = "processing";
      active.progress = 50;
      active.size_done_bytes = 500_000_000;
      active.eta_seconds = 90;
      active.messages.push({ level: "info", text: "Self-test..." }, { level: "info", text: "Loading state..." });
    } else {
      active.status = "terminated";
      active.exit_code = stopped ? 1 : options.exitCode?.[active.command] ?? 0;
      active.messages.push({ level: "info", text: stopped ? "Stopped" : "Everything OK" });
      history.unshift(active);
      active = null;
    }
  };

  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/snapraid/, "") + url.search;
    requests.push(`${init?.method ?? "GET"} ${path}`);
    const auth = new Headers(init?.headers).get("Authorization");
    if (options.auth && auth !== options.auth) return Promise.resolve(new Response("", { status: 401 }));

    if (path === "/v1/schedule") {
      const { tasks } = JSON.parse(String(init?.body));
      const command = tasks[0].command;
      if (!["sync", "scrub", "check", "fix", "diff", "smart", "probe"].includes(command)) {
        return json({ success: false, message: "Unrecognized json" }, 400);
      }
      const number = Math.max(...history.map((task) => task.number), active?.number ?? 0) + 1;
      active = { number, command, status: "queued", log_file: `/var/log/snapraid/${number}-${command}.log`, messages: [] };
      stopped = false;
      return json({ success: true });
    }
    if (path === "/v1/tasks") {
      advance();
      return json({ pending: active?.status === "queued" ? [active] : [], active: active ? [active] : [], history });
    }
    if (path === "/v1/activity") return json(active ?? history[0]);
    if (path === "/v1/stop") {
      stopped = true;
      return json({ success: true, message: "Signal sent" });
    }
    if (path.startsWith("/v1/array")) return json(ARRAY);
    if (path === "/v2/disks") return json(DISKS);
    return json({ message: "Not found" }, 404);
  }) as typeof fetch;

  return { fetchFn, requests };
};

const engineFor = (daemon = fakeDaemon(), extra: Partial<Parameters<typeof createDaemonEngine>[0]> = {}) =>
  createDaemonEngine({
    url: "http://nas:7627/",
    fallback: createFakeEngine(),
    fetch: daemon.fetchFn,
    sleep: () => Promise.resolve(),
    // The daemon runs elsewhere, its logs can't be read
    readLog: () => Promise.reject(new Error("no such file")),
    ...extra,
  });

Deno.test("daemon engine - a sync is queued, followed and reported", async () => {
  const daemon = fakeDaemon();
  const engine = engineFor(daemon);
  const progress: JobProgress[] = [];
  engine.onProgress((_job, p) => progress.push(p));
  const output: string[] = [];

  const outcome = await engine.runJob({
    command: "sync",
    configPath: "/etc/snapraid.conf",
    onOutput: (chunk) => output.push(chunk),
  });

  assertEquals(outcome.report.result, "ok");
  assertEquals(outcome.report.logFile, "5-sync.log");
  assertEquals(outcome.output.exitCode, 0);
  assertEquals(output.join(""), "Self-test...\nLoading state...\nEverything OK\n");
  assertEquals(progress, [{ percent: 50, processedMB: 500, etaMinutes: 2 }]);
  assertEquals(engine.currentJob(), null);
  assertEquals(engine.lastJob()?.command, "sync");
  assert(daemon.requests.includes("POST /v1/schedule"));
});

Deno.test("daemon engine - scrub arguments go along with the task", async () => {
  const daemon = fakeDaemon();
  const requests: Array<{ path: string; body?: string }> = [];
  const engine = engineFor({
    ...daemon,
    fetchFn: ((input: string, init?: RequestInit) => {
      requests.push({ path: new URL(input).pathname, body: init?.body as string | undefined });
      return daemon.fetchFn(input, init);
    }) as typeof fetch,
  });
  await engine.runJob({ command: "scrub", configPath: "/etc/snapraid.conf", args: ["-p", "8", "-o", "10"] });
  const schedule = requests.find((request) => request.path.endsWith("/v1/schedule"));
  assertEquals(JSON.parse(schedule!.body!), { tasks: [{ command: "scrub", args: ["-p", "8", "-o", "10"] }] });
});

Deno.test("daemon engine - a failed sync is an error, its log is used when readable", async () => {
  const failed = await engineFor(fakeDaemon({ exitCode: { sync: 1 } })).runJob({ command: "sync", configPath: "/c" });
  assertEquals(failed.report.result, "error");

  // The daemon runs here: the task's SnapRAID log tells the details
  const withLog = await engineFor(fakeDaemon(), {
    readLog: () => Promise.resolve("summary:error_io:2\nsummary:error_data:1\nsummary:exit:warning\n"),
  }).runJob({ command: "sync", configPath: "/c" });
  assertEquals(withLog.report.result, "warning");
  assertEquals([withLog.report.ioErrors, withLog.report.dataErrors], [2, 1]);
  assertEquals(withLog.output.logPath, "/var/log/snapraid/5-sync.log");
});

Deno.test("daemon engine - abort stops the daemon's task and counts as aborted", async () => {
  const daemon = fakeDaemon();
  const engine = engineFor(daemon);
  const outcome = await engine.runJob({
    command: "sync",
    configPath: "/c",
    onOutput: () => {
      const job = engine.currentJob();
      if (job && !job.aborting) assert(engine.abortJob(job.processId));
    },
  });
  assert(daemon.requests.includes("POST /v1/stop"));
  assertEquals(outcome.report.result, "aborted");
  assertEquals(outcome.output.aborted, true);
});

Deno.test("daemon engine - touch and status go to the fallback", async () => {
  const fallback = createFakeEngine();
  const daemon = fakeDaemon();
  const engine = engineFor(daemon, { fallback });
  await engine.runJob({ command: "touch", configPath: "/c" });
  await engine.runJob({ command: "status", configPath: "/c" });
  assertEquals(fallback.jobs, ["touch", "status"]);
  assert(!daemon.requests.includes("POST /v1/schedule"));
});

Deno.test("daemon engine - smart job reports the disks of /v2/disks", async () => {
  const outcome = await engineFor().runJob({ command: "smart", configPath: "/c" });
  assertEquals(outcome.smart?.map((disk) => [disk.name, disk.device, disk.status]), [
    ["d1", "/dev/sda", "OK"],
    ["parity", "/dev/sdd", "UNKNOWN"],
  ]);
});

Deno.test("daemon engine - status and diff refuse while a job runs", async () => {
  const engine = engineFor();
  await engine.runJob({
    command: "sync",
    configPath: "/c",
    afterRun: async () => {
      await assertRejects(() => engine.readStatus("/c"), EngineBusyError);
      await assertRejects(() => engine.readDiff("/c"), EngineBusyError);
    },
  });
});

Deno.test("daemon engine - diff runs a diff task, then reads the changes", async () => {
  const daemon = fakeDaemon();
  const report = await engineFor(daemon).readDiff("/c");
  assertEquals([report.newFiles, report.deletedFiles, report.movedFiles], [1, 1, 1]);
  assertEquals(report.failed, false);
  assert(daemon.requests.some((request) => request.startsWith("GET /v1/array?limit_diffs=")));
});

Deno.test("daemon engine - basic auth and errors", async () => {
  const daemon = fakeDaemon({ auth: `Basic ${btoa("admin:secret")}` });
  const status = await engineFor(daemon, { username: "admin", password: "secret" }).readStatus("/c");
  assertEquals(status.status.totalFiles, 1204);

  const denied = await assertRejects(() => engineFor(daemon, { username: "admin", password: "wrong" }).readStatus("/c"), DaemonError);
  assertEquals(denied.status, 401);

  const unreachable = engineFor(fakeDaemon(), { fetch: (() => Promise.reject(new TypeError("Connection refused"))) as typeof fetch });
  const error = await assertRejects(() => unreachable.readPowerStates("/c"), DaemonError);
  assert(error.message.includes("not reachable at http://nas:7627"));
});

Deno.test("daemon mapping - array and disks become the UI's status", () => {
  const status = toStatus(ARRAY, DISKS);
  assertEquals(status.scrubPercentage, 75);
  assertEquals([status.totalUsedGB, status.totalFreeGB], [5000, 3000]);
  assertEquals([status.oldestScrubDays, status.medianScrubDays], [42, 7]);
  assertEquals(status.disks?.map((disk) => [disk.name, disk.usePercent]), [["d1", 75], ["d2", 50]]);
  // A degraded disk is the daemon's "not what the content file recorded"
  assertEquals(status.diskIssues, [{ disk: "d2", type: "data", kind: "missing", path: "/mnt/disk2/" }]);
  assert(status.parityUpToDate && !status.hasErrors);

  const broken = toStatus({ ...ARRAY, blocks_bad: 3, blocks_unsynced: 10 }, DISKS);
  assertEquals([broken.hasErrors, broken.badBlocks, broken.syncIncomplete, broken.parityUpToDate], [true, 3, true, false]);
});

Deno.test("daemon mapping - SMART attributes get their ids back, the assessment works on them", () => {
  const [disk, parity] = toSmartDisks(DISKS);
  assertEquals(disk.failureProbability, 4.46);
  assertEquals(disk.attributes?.map((attribute) => [attribute.id, attribute.raw]), [[5, "16"], [9, "38411"]]);
  assertEquals(assessSmart(disk).reasons, [{ kind: "sectors", attribute: "reallocated", count: 16 }]);
  assertEquals([parity.standby, parity.status], [true, "UNKNOWN"]);

  const failing = toSmartDisks({ data_disks: [{ name: "d1", devices: [{ ...DEVICE, smart: { ...DEVICE.smart, failing: true } }] }] });
  assertEquals(failing[0].status, "FAIL");
});

Deno.test("daemon mapping - power states, diff and run results", () => {
  assertEquals(toPowerStates(DISKS).map((disk) => disk.status), ["Active", "Standby"]);
  assertEquals(toDiffReport(ARRAY).files.map((file) => file.status), ["removed", "added", "moved"]);
  assertEquals(diffSucceeded({ number: 1, command: "diff", status: "terminated", exit_code: 2 }), true);
  assertEquals(diffSucceeded({ number: 1, command: "diff", status: "terminated", exit_code: 1 }), false);

  const task = { number: 1, command: "sync", status: "terminated" as const, exit_code: 0, error_io: 1 };
  assertEquals(toRunReport("sync", task, false, "").result, "ok");
  assertEquals(toRunReport("sync", task, false, "").ioErrors, 1);
  assertEquals(toRunReport("sync", { ...task, status: "canceled" }, false, "").result, "error");
  assertEquals(toRunReport("sync", task, true, "").result, "aborted");
});

Deno.test("daemon mapping - the last sync and scrub come from the task history", () => {
  const history = [
    { number: 9, command: "sync", status: "terminated" as const, exit_code: 1, finished_at: "2026-10-09T03:10:00", log_file: "/var/log/snapraid/9-sync.log" },
    { number: 8, command: "scrub", status: "terminated" as const, exit_code: 0, finished_at: "2026-10-08T03:30:00", log_file: "/var/log/snapraid/8-scrub.log" },
    { number: 7, command: "sync", status: "terminated" as const, exit_code: 0, finished_at: "2026-10-08T03:00:00" },
    { number: 10, command: "sync", status: "queued" as const },
  ];
  const runs = toLastRuns(history);
  assertEquals(runs.sync?.result, "error");
  assertEquals(runs.sync?.logFile, "");
  assertEquals(runs.scrub?.result, "ok");
  assertEquals(toLastRuns([]), { sync: null, scrub: null });
});

Deno.test("daemon engine - a task the daemon never runs does not hang the job", async () => {
  const daemon = fakeDaemon();
  const engine = engineFor({
    ...daemon,
    // Accepts the task, then never lists it
    fetchFn: ((input: string, init?: RequestInit) =>
      new URL(input).pathname.endsWith("/v1/tasks")
        ? Promise.resolve(new Response(JSON.stringify({ pending: [], active: [], history: [] })))
        : daemon.fetchFn(input, init)) as typeof fetch,
  });
  const error = await assertRejects(() => engine.runJob({ command: "sync", configPath: "/c" }), DaemonError);
  assert(error.message.includes("never ran it"));
  assertEquals(engine.currentJob(), null);
  assertEquals(engine.lastJob()?.error?.includes("never ran it"), true);
});
