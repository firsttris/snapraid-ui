import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { LogFile, MaintenanceSettings, Schedule, SnapRaidConfig } from "@shared/types.ts";
import { DEFAULT_MAINTENANCE_SETTINGS } from "../../config/maintenance-settings.ts";
import { createMcpServer, DOCS_DIR, fileNameOf, type McpDeps } from "../mcp.ts";
import type { ConfigMetrics } from "../metrics.ts";
import type { LogManager } from "../../snapraid/log-manager.ts";
import { createMcpRoutes, setMcpSources } from "../../routes/mcp.ts";
import type { Scheduler } from "../../schedule/scheduler.ts";
import { createFakeEngine } from "../../engine/__tests__/fake-engine.ts";

const ARRAYS: SnapRaidConfig[] = [
  { name: "Media", path: "media.conf", enabled: true },
  { name: "Old", path: "old.conf", enabled: false },
];

const MEDIA: ConfigMetrics = {
  name: "Media",
  path: "/data/media.conf",
  lastRuns: { sync: { timestamp: "2026-10-18T02:00:00.000Z", result: "ok", logFile: "sync.log" }, scrub: null },
  status: {
    timestamp: "2026-10-18T08:00:00.000Z",
    status: {
      hasErrors: false,
      badBlocks: 2,
      parityUpToDate: true,
      newFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      rawOutput: "a lot of output",
      scrubHistory: [],
    },
  },
  usage: { date: "2026-10-18", usedGB: 100, freeGB: 300, disks: { d1: { usedGB: 100, freeGB: 300 } } },
  smart: { d1: { date: "2026-10-18", temperature: 38 } },
};

const LOGS: LogFile[] = [
  { filename: "sync-1.log", path: "/logs/sync-1.log", command: "sync", timestamp: "2026-10-17T02:00:00.000Z", size: 10 },
  { filename: "scrub-1.log", path: "/logs/scrub-1.log", command: "scrub", timestamp: "2026-10-18T03:00:00.000Z", size: 10 },
];

const SCHEDULE: Schedule = {
  id: "nightly",
  name: "Nightly sync",
  command: "sync",
  configPath: "media.conf",
  cronExpression: "0 2 * * *",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const setup = async (overrides: Partial<McpDeps> = {}) => {
  const engine = createFakeEngine();
  const calls: string[] = [];
  const deps: McpDeps = {
    version: "test",
    allowActions: true,
    engine: () => engine,
    arrays: () => Promise.resolve(ARRAYS),
    resolvePath: (path) => `/data/${path}`,
    dataDir: "/data",
    snapshot: () => Promise.resolve([MEDIA]),
    usageHistory: () => Promise.resolve([]),
    readStatus: (path) => engine.readStatus(path),
    parseConfig: () => Promise.resolve({ parity: [], content: [], data: { d1: "/mnt/d1/" }, pendingRemoval: [], exclude: [] }),
    logManager: {
      listLogs: () => Promise.resolve(LOGS),
      readLog: (filename) => Promise.resolve(`line 1\nline 2\nend of ${filename}`),
    },
    scheduler: {
      getSchedules: () => Promise.resolve([SCHEDULE]),
      getNextRuns: () => new Map([["nightly", new Date("2026-10-20T02:00:00.000Z")]]),
      runNow: (id) => {
        calls.push(`run ${id}`);
        return Promise.resolve({ done: Promise.resolve() });
      },
      updateSchedule: (id, updates) => {
        calls.push(`update ${id} ${JSON.stringify(updates)}`);
        return Promise.resolve({ ...SCHEDULE, ...updates });
      },
    },
    runCommand: (path, command) => {
      calls.push(`${command} ${path}`);
      return Promise.resolve();
    },
    listMounts: () => Promise.resolve([{ path: "/mnt/d1" }]),
    missingPaths: () => Promise.resolve([]),
    createArray: (name, fileName) => {
      calls.push(`create ${name} ${fileName}`);
      return Promise.resolve({ ok: true, path: fileName });
    },
    docsDir: DOCS_DIR,
    ...overrides,
  };
  const server = await createMcpServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const [content] = result.content as { type: string; text: string }[];
    return { isError: result.isError === true, text: content.text };
  };
  return { client, call, calls, engine, close: () => client.close() };
};

const ACTIONS = ["start_job", "abort_job", "run_schedule", "skip_schedule_run", "create_array"];

test("mcp - an agent can't turn a schedule off", async () => {
  const { client, call, calls, close } = await setup();
  const skip = (await client.listTools()).tools.find((tool) => tool.name === "skip_schedule_run");
  expect(Object.keys(skip?.inputSchema.properties ?? {}).sort()).toEqual(["scheduleId", "skip"]);
  // Unknown arguments are dropped, the schedule is only skipped
  await call("skip_schedule_run", { scheduleId: "nightly", enabled: false });
  expect(calls).toEqual(['update nightly {"skipNext":true}']);
  await close();
});

test("mcp - the actions are only offered when allowed", async () => {
  const open = await setup();
  const names = (await open.client.listTools()).tools.map((tool) => tool.name);
  for (const action of ACTIONS) expect(names.includes(action), action).toBeTruthy();
  expect(names.includes("get_overview")).toBeTruthy();
  await open.close();

  const readOnly = await setup({ allowActions: false });
  const readOnlyNames = (await readOnly.client.listTools()).tools.map((tool) => tool.name);
  expect(readOnlyNames.filter((name) => ACTIONS.includes(name))).toEqual([]);
  expect(readOnlyNames.includes("get_overview")).toBeTruthy();
  await readOnly.close();
});

test("mcp - get_overview reports health and usage without the raw output", async () => {
  const { call, close } = await setup();
  const { isError, text } = await call("get_overview");
  expect(isError).toEqual(false);
  const overview = JSON.parse(text);
  expect(overview.arrays[0].name).toEqual("Media");
  expect(overview.arrays[0].health).toEqual("errors");
  expect(overview.arrays[0].bad_blocks).toEqual(2);
  expect(overview.arrays[0].disks.d1).toEqual({ temperature: 38, used_percent: 25 });
  expect(overview.arrays[0].status.rawOutput).toEqual(undefined);
  expect(overview.job.running).toEqual(null);
  await close();
});

test("mcp - an array is picked by name, the only enabled one when left out", async () => {
  const { call, calls, close } = await setup();
  expect((await call("start_job", { command: "sync" })).isError).toEqual(false);
  expect((await call("start_job", { array: "media", command: "scrub" })).isError).toEqual(false);
  expect(calls).toEqual(["sync /data/media.conf", "scrub /data/media.conf"]);

  const unknown = await call("start_job", { array: "Photos", command: "sync" });
  expect(unknown.isError).toEqual(true);
  expect(unknown.text).toContain('"Media"');
  await close();
});

test("mcp - start_job passes on why a job could not start", async () => {
  const { call, close } = await setup({ runCommand: () => Promise.reject(new Error("Sync skipped: too many deleted")) });
  const result = await call("start_job", { command: "sync" });
  expect(result).toEqual({ isError: true, text: "Sync skipped: too many deleted" });
  await close();
});

test("mcp - several arrays need a name", async () => {
  const both = ARRAYS.map((array) => ({ ...array, enabled: true }));
  const { call, close } = await setup({ arrays: () => Promise.resolve(both) });
  const result = await call("read_status");
  expect(result.isError).toEqual(true);
  expect(result.text).toContain("several arrays");
  await close();
});

test("mcp - logs are listed newest first and only known ones are read", async () => {
  const { call, close } = await setup();
  const logs = JSON.parse((await call("list_logs")).text);
  expect(logs.map((log: { filename: string }) => log.filename)).toEqual(["scrub-1.log", "sync-1.log"]);
  expect(JSON.parse((await call("list_logs", { command: "sync" })).text).length).toEqual(1);

  expect((await call("read_log", { filename: "sync-1.log" })).text).toContain("end of sync-1.log");
  expect((await call("read_log", { filename: "../config.json" })).isError).toEqual(true);
  expect((await call("read_log", { filename: "other.log" })).isError).toEqual(true);
  await close();
});

test("mcp - schedules come with their next run and can be skipped and run", async () => {
  const { call, calls, close } = await setup();
  const [schedule] = JSON.parse((await call("list_schedules")).text);
  expect(schedule.array).toEqual("Media");
  expect(schedule.nextRun).toEqual("2026-10-20T02:00:00.000Z");

  await call("skip_schedule_run", { scheduleId: "nightly" });
  await call("skip_schedule_run", { scheduleId: "nightly", skip: false });
  await call("run_schedule", { scheduleId: "nightly" });
  expect(calls).toEqual(['update nightly {"skipNext":true}', 'update nightly {"skipNext":false}', "run nightly"]);
  await close();
});

test("mcp - check_array_setup shows problems or the config it would write", async () => {
  const { call, close } = await setup();
  const invalid = JSON.parse((await call("check_array_setup", { dataDisks: [], parityPaths: ["/mnt/p"] })).text);
  expect(invalid.valid).toEqual(false);
  expect(invalid.problems).toEqual(["no_data"]);

  const valid = JSON.parse(
    (await call("check_array_setup", {
      name: "Media",
      dataDisks: [{ name: "d1", path: "/mnt/d1" }],
      parityPaths: ["/mnt/parity"],
    })).text,
  );
  expect(valid.valid).toEqual(true);
  expect(valid.config).toContain("parity /mnt/parity/snapraid.parity");
  expect(valid.config).toContain("content /data/media.content");
  await close();
});

test("mcp - create_array names the config after the array", async () => {
  const { call, calls, close } = await setup();
  const result = await call("create_array", {
    name: "Media Server",
    dataDisks: [{ name: "d1", path: "/mnt/d1" }],
    parityPaths: ["/mnt/parity"],
  });
  expect(result.isError).toEqual(false);
  expect(calls).toEqual(["create Media Server media-server.conf"]);
  expect(fileNameOf("  Fotos & Videos ")).toEqual("fotos-videos");
  await close();
});

test("mcp - create_array refuses a blank name, like the setup wizard", async () => {
  const { call, calls, close } = await setup();
  const result = await call("create_array", {
    name: "   ",
    dataDisks: [{ name: "d1", path: "/mnt/d1" }],
    parityPaths: ["/mnt/parity"],
  });
  expect(result.isError).toEqual(true);
  expect(calls).toEqual([]);
  await close();
});

test("mcp - get_changes and read_status leave out the raw output and report a locked SnapRAID", async () => {
  const { call, engine, close } = await setup();
  const changes = JSON.parse((await call("get_changes")).text);
  expect(changes.array).toEqual("Media");
  expect(changes.rawOutput).toEqual(undefined);
  const status = JSON.parse((await call("read_status")).text);
  expect(status.status.rawOutput).toEqual(undefined);

  engine.setBusy(true);
  expect(await call("read_status")).toEqual({ isError: true, text: "SnapRAID is in use by another process" });
  await close();
});

test("mcp - get_changes waits for a running job", async () => {
  const engine = createFakeEngine();
  const running = { command: "sync" as const, configPath: "/data/media.conf", startTime: "", processId: "1" };
  const { call, close } = await setup({ engine: () => ({ ...engine, currentJob: () => running }) });
  expect((await call("get_changes")).isError).toEqual(true);
  const job = JSON.parse((await call("get_job")).text);
  expect(job.running.array).toEqual("Media");
  await close();
});

test("mcp - the documentation is a tool and resources", async () => {
  const { client, call, close } = await setup();
  const pages = JSON.parse((await call("read_documentation")).text) as { page: string; title: string }[];
  expect(pages[0].page).toEqual("README");
  expect(pages.some((page) => page.page === "disks")).toBeTruthy();

  expect((await call("read_documentation", { page: "security" })).text).toContain("# Security");
  expect((await call("read_documentation", { page: "../README" })).isError).toEqual(true);

  const resources = (await client.listResources()).resources.map((resource) => resource.uri);
  expect(resources.includes("docs://snapraid-ui/automation")).toBeTruthy();
  const read = await client.readResource({ uri: "docs://snapraid-ui/automation" });
  expect((read.contents[0] as { text: string }).text).toContain("# Automation");
  await close();
});

const settingsWith = (mcp: Partial<MaintenanceSettings["mcp"]>) => () =>
  Promise.resolve({ ...DEFAULT_MAINTENANCE_SETTINGS, mcp: { ...DEFAULT_MAINTENANCE_SETTINGS.mcp, ...mcp } });

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};

const post = (routes: ReturnType<typeof createMcpRoutes>, token?: string) =>
  routes.request("/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(initialize),
  });

test("mcp route - off by default and never without the token", async () => {
  expect((await post(createMcpRoutes(settingsWith({})), "x")).status).toEqual(404);

  const routes = createMcpRoutes(settingsWith({ enabled: true, token: "a-long-enough-token" }));
  const missing = await post(routes);
  expect(missing.status).toEqual(401);
  expect(missing.headers.get("WWW-Authenticate")).toEqual('Bearer realm="snapraid-ui"');
  expect((await post(routes, "wrong-token")).status).toEqual(401);

  // An empty token never matches, even an empty header
  expect((await post(createMcpRoutes(settingsWith({ enabled: true, token: "" })), "")).status).toEqual(401);
});

test("mcp route - answers MCP with the token", async () => {
  setMcpSources({} as LogManager, {} as Scheduler);
  const routes = createMcpRoutes(settingsWith({ enabled: true, token: "a-long-enough-token" }));
  const res = await post(routes, "a-long-enough-token");
  expect(res.status).toEqual(200);
  const body: any = await res.json();
  expect(body.result.serverInfo.name).toEqual("snapraid-ui");
  expect(body.result.instructions).toContain("get_overview");
});
