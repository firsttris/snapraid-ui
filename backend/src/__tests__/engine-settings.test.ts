import { assert, assertEquals } from "@std/assert";
import { SECRET_MASK } from "@shared/types.ts";
import {
  buildEngine,
  checkDaemon,
  DEFAULT_ENGINE_SETTINGS,
  maskEngineSecrets,
  normalizeEngineSettings,
} from "../engine/engine-settings.ts";
import { createFakeEngine } from "./fake-engine.ts";

const target = (changes = {}) => ({
  configPath: "/etc/media.conf",
  url: "http://nas:7627/",
  username: "admin",
  password: "secret",
  ...changes,
});
const daemonSettings = (...daemons: ReturnType<typeof target>[]) => ({
  mode: "daemon" as const,
  daemons: daemons.length ? daemons : [target()],
});

Deno.test("engine settings - the password stays on the server", () => {
  const stored = daemonSettings();
  assertEquals(maskEngineSecrets(stored).daemons[0].password, SECRET_MASK);
  const { settings } = normalizeEngineSettings(maskEngineSecrets(stored), stored);
  assertEquals(settings.daemons[0].password, "secret");
  assertEquals(settings.daemons[0].url, "http://nas:7627");
});

Deno.test("engine settings - each daemon needs a URL and its own config", () => {
  const error = (settings: ReturnType<typeof daemonSettings>) =>
    typeof normalizeEngineSettings(settings, DEFAULT_ENGINE_SETTINGS).error;
  assertEquals(error(daemonSettings(target({ url: "nas:7627" }))), "string");
  assertEquals(error(daemonSettings(target({ configPath: "" }))), "string");
  assertEquals(error(daemonSettings(target(), target({ url: "http://nas:7628" }))), "string");
  assertEquals(error({ mode: "daemon", daemons: [] }), "string");
  assertEquals(error(daemonSettings(target(), target({ configPath: "/etc/backup.conf", url: "http://nas:7628" }))), "undefined");
  // The CLI needs neither, older files without the field fall back to it
  assertEquals(normalizeEngineSettings({}, DEFAULT_ENGINE_SETTINGS), { settings: DEFAULT_ENGINE_SETTINGS });
});

Deno.test("engine settings - each config runs on its daemon, the others on the CLI", async () => {
  const cli = createFakeEngine();
  const daemons = new Map([["http://nas:7627", createFakeEngine()], ["http://nas:7628", createFakeEngine()]]);
  const engine = buildEngine(
    daemonSettings(target(), target({ configPath: "/etc/backup.conf", url: "http://nas:7628" })),
    cli,
    ({ url }) => daemons.get(url.replace(/\/+$/, ""))!,
  );

  await engine.runJob({ command: "sync", configPath: "/etc/media.conf" });
  await engine.runJob({ command: "scrub", configPath: "/etc/backup.conf" });
  await engine.runJob({ command: "touch", configPath: "/etc/test.conf" });
  assertEquals(daemons.get("http://nas:7627")!.jobs, ["sync"]);
  assertEquals(daemons.get("http://nas:7628")!.jobs, ["scrub"]);
  assertEquals(cli.jobs, ["touch"]);
  assertEquals(engine.kind, "daemon");

  // One job at a time over all of them: a job of one daemon is the current job
  await daemons.get("http://nas:7628")!.runJob({
    command: "sync",
    configPath: "/etc/backup.conf",
    afterRun: () => {
      assertEquals(engine.currentJob()?.configPath, "/etc/backup.conf");
      return Promise.resolve();
    },
  });
  assertEquals(engine.lastJob()?.command, "sync");

  assert(buildEngine(DEFAULT_ENGINE_SETTINGS, cli) === cli);
});

Deno.test("checkDaemon - versions, the array it serves and what it would run next to the UI", async () => {
  const fetchFn = ((input: string) => {
    const body = input.endsWith("/v1/array")
      ? { daemon_version: "2.0rc2", engine_version: "15.0rc2", engine_conf: "/etc/other.conf" }
      : { maintenance_schedule: "02:00", spindown_idle_minutes: "0", hook_docker_pause: "", notify_result: "mail -s x" };
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as typeof fetch;

  const check = await checkDaemon(target(), fetchFn);
  assertEquals(check, {
    ok: true,
    daemonVersion: "2.0rc2",
    engineVersion: "15.0rc2",
    engineConf: "/etc/other.conf",
    warnings: ["schedule", "notifications", "other_array"],
  });

  const down = await checkDaemon(target(), (() => Promise.reject(new TypeError("refused"))) as typeof fetch);
  assertEquals(down.ok, false);
  assert(down.error?.includes("not reachable"));
});
