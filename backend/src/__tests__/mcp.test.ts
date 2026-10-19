import { assert, assertEquals, assertStringIncludes } from "@std/assert";
// @ts-types="@modelcontextprotocol/sdk/client/index"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// @ts-types="@modelcontextprotocol/sdk/inMemory"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { LogFile, MaintenanceSettings, Schedule, SnapRaidConfig } from "@shared/types.ts";
import { DEFAULT_MAINTENANCE_SETTINGS } from "../maintenance-settings.ts";
import { createMcpServer, DOCS_DIR, fileNameOf, type McpDeps } from "../mcp.ts";
import type { ConfigMetrics } from "../metrics.ts";
import type { LogManager } from "../log-manager.ts";
import { createMcpRoutes, setMcpSources } from "../routes/mcp.ts";
import type { Scheduler } from "../scheduler.ts";
import { createFakeEngine } from "./fake-engine.ts";

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

const ACTIONS = ["start_job", "abort_job", "run_schedule", "update_schedule", "create_array"];

Deno.test("mcp - the actions are only offered when allowed", async () => {
  const open = await setup();
  const names = (await open.client.listTools()).tools.map((tool) => tool.name);
  for (const action of ACTIONS) assert(names.includes(action), action);
  assert(names.includes("get_overview"));
  await open.close();

  const readOnly = await setup({ allowActions: false });
  const readOnlyNames = (await readOnly.client.listTools()).tools.map((tool) => tool.name);
  assertEquals(readOnlyNames.filter((name) => ACTIONS.includes(name)), []);
  assert(readOnlyNames.includes("get_overview"));
  await readOnly.close();
});

Deno.test("mcp - get_overview reports health and usage without the raw output", async () => {
  const { call, close } = await setup();
  const { isError, text } = await call("get_overview");
  assertEquals(isError, false);
  const overview = JSON.parse(text);
  assertEquals(overview.arrays[0].name, "Media");
  assertEquals(overview.arrays[0].health, "errors");
  assertEquals(overview.arrays[0].bad_blocks, 2);
  assertEquals(overview.arrays[0].disks.d1, { temperature: 38, used_percent: 25 });
  assertEquals(overview.arrays[0].status.rawOutput, undefined);
  assertEquals(overview.job.running, null);
  await close();
});

Deno.test("mcp - an array is picked by name, the only enabled one when left out", async () => {
  const { call, calls, close } = await setup();
  assertEquals((await call("start_job", { command: "sync" })).isError, false);
  assertEquals((await call("start_job", { array: "media", command: "scrub" })).isError, false);
  assertEquals(calls, ["sync /data/media.conf", "scrub /data/media.conf"]);

  const unknown = await call("start_job", { array: "Photos", command: "sync" });
  assertEquals(unknown.isError, true);
  assertStringIncludes(unknown.text, '"Media"');
  await close();
});

Deno.test("mcp - start_job passes on why a job could not start", async () => {
  const { call, close } = await setup({ runCommand: () => Promise.reject(new Error("Sync skipped: too many deleted")) });
  const result = await call("start_job", { command: "sync" });
  assertEquals(result, { isError: true, text: "Sync skipped: too many deleted" });
  await close();
});

Deno.test("mcp - several arrays need a name", async () => {
  const both = ARRAYS.map((array) => ({ ...array, enabled: true }));
  const { call, close } = await setup({ arrays: () => Promise.resolve(both) });
  const result = await call("read_status");
  assertEquals(result.isError, true);
  assertStringIncludes(result.text, "several arrays");
  await close();
});

Deno.test("mcp - logs are listed newest first and only known ones are read", async () => {
  const { call, close } = await setup();
  const logs = JSON.parse((await call("list_logs")).text);
  assertEquals(logs.map((log: { filename: string }) => log.filename), ["scrub-1.log", "sync-1.log"]);
  assertEquals(JSON.parse((await call("list_logs", { command: "sync" })).text).length, 1);

  assertStringIncludes((await call("read_log", { filename: "sync-1.log" })).text, "end of sync-1.log");
  assertEquals((await call("read_log", { filename: "../config.json" })).isError, true);
  assertEquals((await call("read_log", { filename: "other.log" })).isError, true);
  await close();
});

Deno.test("mcp - schedules come with their next run and can be skipped", async () => {
  const { call, calls, close } = await setup();
  const [schedule] = JSON.parse((await call("list_schedules")).text);
  assertEquals(schedule.array, "Media");
  assertEquals(schedule.nextRun, "2026-10-20T02:00:00.000Z");

  assertEquals((await call("update_schedule", { scheduleId: "nightly" })).isError, true);
  await call("update_schedule", { scheduleId: "nightly", skipNext: true });
  await call("run_schedule", { scheduleId: "nightly" });
  assertEquals(calls, ['update nightly {"skipNext":true}', "run nightly"]);
  await close();
});

Deno.test("mcp - check_array_setup shows problems or the config it would write", async () => {
  const { call, close } = await setup();
  const invalid = JSON.parse((await call("check_array_setup", { dataDisks: [], parityPaths: ["/mnt/p"] })).text);
  assertEquals(invalid.valid, false);
  assertEquals(invalid.problems, ["no_data"]);

  const valid = JSON.parse(
    (await call("check_array_setup", {
      name: "Media",
      dataDisks: [{ name: "d1", path: "/mnt/d1" }],
      parityPaths: ["/mnt/parity"],
    })).text,
  );
  assertEquals(valid.valid, true);
  assertStringIncludes(valid.config, "parity /mnt/parity/snapraid.parity");
  assertStringIncludes(valid.config, "content /data/media.content");
  await close();
});

Deno.test("mcp - create_array names the config after the array", async () => {
  const { call, calls, close } = await setup();
  const result = await call("create_array", {
    name: "Media Server",
    dataDisks: [{ name: "d1", path: "/mnt/d1" }],
    parityPaths: ["/mnt/parity"],
  });
  assertEquals(result.isError, false);
  assertEquals(calls, ["create Media Server media-server.conf"]);
  assertEquals(fileNameOf("  Fotos & Videos "), "fotos-videos");
  await close();
});

Deno.test("mcp - create_array refuses a blank name, like the setup wizard", async () => {
  const { call, calls, close } = await setup();
  const result = await call("create_array", {
    name: "   ",
    dataDisks: [{ name: "d1", path: "/mnt/d1" }],
    parityPaths: ["/mnt/parity"],
  });
  assertEquals(result.isError, true);
  assertEquals(calls, []);
  await close();
});

Deno.test("mcp - get_changes and read_status leave out the raw output and report a locked SnapRAID", async () => {
  const { call, engine, close } = await setup();
  const changes = JSON.parse((await call("get_changes")).text);
  assertEquals(changes.array, "Media");
  assertEquals(changes.rawOutput, undefined);
  const status = JSON.parse((await call("read_status")).text);
  assertEquals(status.status.rawOutput, undefined);

  engine.setBusy(true);
  assertEquals(await call("read_status"), { isError: true, text: "SnapRAID is in use by another process" });
  await close();
});

Deno.test("mcp - get_changes waits for a running job", async () => {
  const engine = createFakeEngine();
  const running = { command: "sync" as const, configPath: "/data/media.conf", startTime: "", processId: "1" };
  const { call, close } = await setup({ engine: () => ({ ...engine, currentJob: () => running }) });
  assertEquals((await call("get_changes")).isError, true);
  const job = JSON.parse((await call("get_job")).text);
  assertEquals(job.running.array, "Media");
  await close();
});

Deno.test("mcp - the documentation is a tool and resources", async () => {
  const { client, call, close } = await setup();
  const pages = JSON.parse((await call("read_documentation")).text) as { page: string; title: string }[];
  assertEquals(pages[0].page, "README");
  assert(pages.some((page) => page.page === "disks"));

  assertStringIncludes((await call("read_documentation", { page: "security" })).text, "# Security");
  assertEquals((await call("read_documentation", { page: "../README" })).isError, true);

  const resources = (await client.listResources()).resources.map((resource) => resource.uri);
  assert(resources.includes("docs://snapraid-ui/automation"));
  const read = await client.readResource({ uri: "docs://snapraid-ui/automation" });
  assertStringIncludes((read.contents[0] as { text: string }).text, "# Automation");
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

Deno.test("mcp route - off by default and never without the token", async () => {
  assertEquals((await post(createMcpRoutes(settingsWith({})), "x")).status, 404);

  const routes = createMcpRoutes(settingsWith({ enabled: true, token: "a-long-enough-token" }));
  const missing = await post(routes);
  assertEquals(missing.status, 401);
  assertEquals(missing.headers.get("WWW-Authenticate"), 'Bearer realm="snapraid-ui"');
  assertEquals((await post(routes, "wrong-token")).status, 401);

  // An empty token never matches, even an empty header
  assertEquals((await post(createMcpRoutes(settingsWith({ enabled: true, token: "" })), "")).status, 401);
});

Deno.test("mcp route - answers MCP with the token", async () => {
  setMcpSources({} as LogManager, {} as Scheduler);
  const routes = createMcpRoutes(settingsWith({ enabled: true, token: "a-long-enough-token" }));
  const res = await post(routes, "a-long-enough-token");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.result.serverInfo.name, "snapraid-ui");
  assertStringIncludes(body.result.instructions, "get_overview");
});
