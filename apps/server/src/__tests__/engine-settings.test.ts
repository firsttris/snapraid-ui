import { expect, test } from "bun:test";
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

test("engine settings - the password stays on the server", () => {
  const stored = daemonSettings();
  expect(maskEngineSecrets(stored).daemons[0].password).toEqual(SECRET_MASK);
  const { settings } = normalizeEngineSettings(maskEngineSecrets(stored), stored);
  expect(settings.daemons[0].password).toEqual("secret");
  expect(settings.daemons[0].url).toEqual("http://nas:7627");
});

test("engine settings - each daemon needs a URL and its own config", () => {
  const error = (settings: ReturnType<typeof daemonSettings>) =>
    typeof normalizeEngineSettings(settings, DEFAULT_ENGINE_SETTINGS).error;
  expect(error(daemonSettings(target({ url: "nas:7627" })))).toEqual("string");
  expect(error(daemonSettings(target({ configPath: "" })))).toEqual("string");
  expect(error(daemonSettings(target(), target({ url: "http://nas:7628" })))).toEqual("string");
  expect(error({ mode: "daemon", daemons: [] })).toEqual("string");
  expect(error(daemonSettings(target(), target({ configPath: "/etc/backup.conf", url: "http://nas:7628" })))).toEqual("undefined");
  // The CLI needs neither, older files without the field fall back to it
  expect(normalizeEngineSettings({}, DEFAULT_ENGINE_SETTINGS)).toEqual({ settings: DEFAULT_ENGINE_SETTINGS });
});

test("engine settings - each config runs on its daemon, the others on the CLI", async () => {
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
  expect(daemons.get("http://nas:7627")!.jobs).toEqual(["sync"]);
  expect(daemons.get("http://nas:7628")!.jobs).toEqual(["scrub"]);
  expect(cli.jobs).toEqual(["touch"]);
  expect(engine.kind).toEqual("daemon");

  // One job at a time over all of them: a job of one daemon is the current job
  await daemons.get("http://nas:7628")!.runJob({
    command: "sync",
    configPath: "/etc/backup.conf",
    afterRun: () => {
      expect(engine.currentJob()?.configPath).toEqual("/etc/backup.conf");
      return Promise.resolve();
    },
  });
  expect(engine.lastJob()?.command).toEqual("sync");

  expect(buildEngine(DEFAULT_ENGINE_SETTINGS, cli) === cli).toBeTruthy();
});

test("checkDaemon - versions, the array it serves and what it would run next to the UI", async () => {
  const fetchFn = ((input: string) => {
    const body = input.endsWith("/v1/array")
      ? { daemon_version: "2.0rc2", engine_version: "15.0rc2", engine_conf: "/etc/other.conf" }
      : { maintenance_schedule: "02:00", spindown_idle_minutes: "0", hook_docker_pause: "", notify_result: "mail -s x" };
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as typeof fetch;

  const check = await checkDaemon(target(), fetchFn);
  expect(check).toEqual({
    ok: true,
    daemonVersion: "2.0rc2",
    engineVersion: "15.0rc2",
    engineConf: "/etc/other.conf",
    warnings: ["schedule", "notifications", "other_array"],
  });

  const down = await checkDaemon(target(), (() => Promise.reject(new TypeError("refused"))) as unknown as typeof fetch);
  expect(down.ok).toEqual(false);
  expect(down.error?.includes("not reachable")).toBeTruthy();
});
