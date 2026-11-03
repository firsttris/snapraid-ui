import { expect, test } from "bun:test";
import { type Schedule, SECRET_MASK, type SmartDiskInfo } from "@shared/types.ts";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  maskSecrets,
  pingHeartbeat,
  resolveSecrets,
  validateNotificationSettings,
} from "../notifications.ts";
import { buildRunNotification, buildSkipNotification, diffDegradedDisks, diffSmartProblems, heartbeatAfterRun } from "../notification-events.ts";
import { failedReport, parseRunReport } from "../run-report.ts";
import { combineResults, scheduleSteps } from "../scheduler.ts";
import { assessSmart, attributeLevel, smartHints } from "@shared/smart-health.ts";
import { parseSmartOutput } from "../parsers/smart-parser.ts";
import { readFileSync } from "node:fs";

const SYNC_LOG = `summary:added:12
summary:removed:1
summary:updated:3
summary:moved:2
summary:relocated:1
summary:copied:0
summary:error_io:0
summary:error_data:0
summary:exit:ok`;

const SCRUB_BAD_LOG = `summary:error_soft:0
summary:error_io:1
summary:error_data:4
summary:exit:error`;

const FATAL_LOG = `msg:fatal:Disk '/mnt/disk1/' with uuid 'x' not present`;

const ok = { exitCode: 0 };

test("parseRunReport - reads result, changes and errors from the structured log", () => {
  const sync = parseRunReport("sync", SYNC_LOG, ok, 90);
  expect(sync.result).toEqual("ok");
  expect(sync.changes).toEqual({ added: 12, removed: 1, updated: 3, moved: 3, copied: 0 });

  const scrub = parseRunReport("scrub", SCRUB_BAD_LOG, { exitCode: 1 }, 10);
  expect([scrub.result, scrub.ioErrors, scrub.dataErrors]).toEqual(["error", 1, 4]);

  expect(parseRunReport("sync", "", { exitCode: 1 }, 0).result).toEqual("error");
  // A sync log without summary stopped early, touch never writes one
  expect(parseRunReport("sync", "command:sync", ok, 0).result).toEqual("incomplete");
  expect(parseRunReport("touch", "command:touch", ok, 0).result).toEqual("ok");
  // fix repaired everything it found
  expect(parseRunReport("fix", "summary:error_recovered:135\nsummary:exit:recovered", ok, 0).result).toEqual("ok");
  expect(parseRunReport("fix", "summary:exit:unrecoverable", { exitCode: 1 }, 0).result).toEqual("error");
  expect(parseRunReport("touch", `command:touch\n${FATAL_LOG}`, { exitCode: 1 }, 0).result).toEqual("error");
  expect(parseRunReport("sync", SYNC_LOG, { exitCode: 0, aborted: true }, 0).result).toEqual("aborted");
});

test("buildRunNotification - data errors win over success and failure", () => {
  const notification = buildRunNotification("en", "Nightly", "/cfg/snapraid.conf", [
    parseRunReport("sync", SYNC_LOG, ok, 90),
    parseRunReport("scrub", SCRUB_BAD_LOG, { exitCode: 1 }, 3700),
  ]);

  expect(notification?.event).toEqual("data_errors");
  expect(notification?.title).toEqual("Data errors found: Nightly");
  expect(notification!.message).toContain("Sync: OK (2 min)\n  12 added, 3 updated, 1 removed, 3 moved");
  expect(notification!.message).toContain("Scrub: failed (1 h 2 min)\n  1 I/O errors, 4 data errors");
  expect(notification!.message).toContain("Config: snapraid.conf");
});

test("buildRunNotification - reports failures with SnapRAID's reason and skipped steps", () => {
  const notification = buildRunNotification(
    "de",
    "Nacht",
    "/cfg/snapraid.conf",
    [parseRunReport("sync", FATAL_LOG, { exitCode: 1 }, 5)],
    ["scrub"],
  );

  expect(notification?.event).toEqual("job_failed");
  expect(notification?.title).toEqual("Fehlgeschlagen: Nacht");
  expect(notification!.message).toContain("Disk '/mnt/disk1/' with uuid 'x' not present");
  expect(notification!.message).toContain("Scrub: nicht ausgeführt");
});

test("buildRunNotification - success, commands that never started and aborted runs", () => {
  expect(buildRunNotification("en", "x", "c", [parseRunReport("sync", SYNC_LOG, ok, 1)])?.event).toEqual("job_succeeded");

  const failed = buildRunNotification("en", "x", "c", [failedReport("sync", "spawn failed")]);
  expect(failed?.event).toEqual("job_failed");
  expect(failed!.message).toContain("spawn failed");

  expect(buildRunNotification("en", "x", "c", [parseRunReport("sync", SYNC_LOG, { exitCode: 0, aborted: true }, 1)])).toEqual(null);
});

test("buildSkipNotification - explains the sync guard", () => {
  const notification = buildSkipNotification("en", "Nightly", "/cfg/snapraid.conf", {
    timestamp: "",
    result: "skipped",
    skipReason: "too_many_deleted",
    deletedFiles: 812,
    limit: 50,
  });

  expect(notification.event).toEqual("schedule_skipped");
  expect(notification.message).toContain("812 deleted files, more than the limit of 50");
});

test("buildSkipNotification - warns about mass changes, as ransomware leaves them", () => {
  const notification = buildSkipNotification("en", "Nightly", "/cfg/snapraid.conf", {
    timestamp: "",
    result: "skipped",
    skipReason: "too_many_updated",
    updatedFiles: 4210,
    limit: 100,
  });

  expect(notification.message).toContain("4210 changed files, more than the limit of 100");
  expect(notification.message).toContain("ransomware");
});

test("buildSkipNotification - names the missing disks", () => {
  const notification = buildSkipNotification("de", "Nightly", "/cfg/snapraid.conf", {
    timestamp: "",
    result: "skipped",
    skipReason: "disk_missing",
    disks: ["d2", "2-parity"],
  });

  expect(notification.message).toContain("Platte d2, 2-parity fehlt oder ist leer");
});

const disk = (overrides: Partial<SmartDiskInfo>): SmartDiskInfo => ({
  name: "d1",
  device: "/dev/sda",
  serial: "S1",
  status: "OK",
  failureProbability: 4,
  ...overrides,
});

test("diffSmartProblems - reports a disk once per problem and forgets it when healthy", () => {
  const cfg = "/cfg/a.conf";
  const failing = disk({ status: "PREFAIL", failureProbability: 40 });

  const first = diffSmartProblems(cfg, [failing, disk({ name: "d2", serial: "S2" })], 25, {});
  expect(first.report.map((r) => r.disk.name)).toEqual(["d1"]);

  const again = diffSmartProblems(cfg, [failing], 25, first.state);
  expect(again.report).toEqual([]);

  const worse = diffSmartProblems(cfg, [{ ...failing, status: "FAIL" }], 25, again.state);
  expect(worse.report.map((r) => r.disk.status)).toEqual(["FAIL"]);

  const healthy = diffSmartProblems(cfg, [disk({})], 25, worse.state);
  expect(healthy.state).toEqual({});
});

test("diffDegradedDisks - reports a degraded filesystem once, again after it was repaired", () => {
  const cfg = "/cfg/a.conf";
  const first = diffDegradedDisks(cfg, ["d2"], { "/cfg/b.conf|degraded|d2": "degraded" });
  expect(first.report).toEqual(["d2"]);
  expect(first.state).toEqual({ "/cfg/a.conf|degraded|d2": "degraded" });
  expect(diffDegradedDisks(cfg, ["d2"], first.state).report).toEqual([]);
  const repaired = diffDegradedDisks(cfg, [], first.state);
  expect(repaired.state).toEqual({});
  expect(diffDegradedDisks(cfg, ["d2"], repaired.state).report).toEqual(["d2"]);
});

const sectors = (reallocated: number) =>
  disk({
    attributes: [
      { id: 5, name: "Reallocated_Sector_Ct", value: 100, worst: 100, threshold: 10, raw: String(reallocated), flag: "" },
    ],
  });

test("diffSmartProblems - a growing sector count is reported again, a drifting temperature is not", () => {
  const cfg = "/cfg/a.conf";
  const first = diffSmartProblems(cfg, [sectors(8)], 25, {});
  expect(first.report[0].assessment.reasons).toEqual([{ kind: "sectors", attribute: "reallocated", count: 8 }]);
  expect(diffSmartProblems(cfg, [sectors(8)], 25, first.state).report).toEqual([]);
  expect(diffSmartProblems(cfg, [sectors(16)], 25, first.state).report.length).toEqual(1);

  const hot = diffSmartProblems(cfg, [disk({ temperature: 52 })], 25, {});
  expect(diffSmartProblems(cfg, [disk({ temperature: 54 })], 25, hot.state).report).toEqual([]);
});

test("diffSmartProblems - keeps the state of other configs", () => {
  const other = { "/cfg/b.conf|d1|S1": "FAIL|true" };
  const { state } = diffSmartProblems("/cfg/a.conf", [], 25, other);
  expect(state).toEqual(other);
});

test("secrets - masked on the way out, kept when the mask comes back", () => {
  const stored = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    email: { ...DEFAULT_NOTIFICATION_SETTINGS.email, password: "hunter2" },
    ntfy: { ...DEFAULT_NOTIFICATION_SETTINGS.ntfy, token: "tk_1" },
  };

  const masked = maskSecrets(stored);
  expect([masked.email.password, masked.ntfy.token]).toEqual([SECRET_MASK, SECRET_MASK]);

  const resolved = resolveSecrets(masked, stored);
  expect([resolved.email.password, resolved.ntfy.token]).toEqual(["hunter2", "tk_1"]);

  const cleared = resolveSecrets({ ...masked, ntfy: { ...masked.ntfy, token: "" } }, stored);
  expect(cleared.ntfy.token).toEqual("");
});

test("validateNotificationSettings - enabled channels need their fields", () => {
  expect(validateNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)).toEqual(null);
  expect(validateNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ntfy: { ...DEFAULT_NOTIFICATION_SETTINGS.ntfy, enabled: true },
  })).toBeTruthy();
  expect(validateNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    webhook: { enabled: true, url: "ftp://x" },
  })).toBeTruthy();
});

const schedule = (overrides: Partial<Schedule>): Schedule => ({
  id: "1",
  name: "Nightly",
  command: "sync",
  configPath: "snapraid.conf",
  cronExpression: "0 2 * * *",
  enabled: true,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

test("scheduleSteps - touch before and scrub after a sync", () => {
  expect(scheduleSteps(schedule({ touchBefore: true, scrubAfter: ["-p", "8", "-o", "10"] }))).toEqual([
      { command: "touch", args: [] },
      { command: "sync", args: [] },
      { command: "scrub", args: ["-p", "8", "-o", "10"] },
    ]);
  // Only sync schedules chain commands
  expect(scheduleSteps(schedule({ command: "scrub", args: ["-p", "new"], touchBefore: true, scrubAfter: [] }))).toEqual([{ command: "scrub", args: ["-p", "new"] }]);
  expect(scheduleSteps(schedule({ scrubAfter: null })).length).toEqual(1);
});

test("combineResults - first failure, otherwise the worst of ok and warning", () => {
  expect(combineResults(["ok", "ok"])).toEqual("ok");
  expect(combineResults(["ok", "warning", "ok"])).toEqual("warning");
  expect(combineResults(["warning", "error"])).toEqual("error");
  expect(combineResults(["ok", "aborted"])).toEqual("aborted");
});

test("assessSmart - a few percent failure probability is normal, sectors and status are not", () => {
  const disks = parseSmartOutput(readFileSync(new URL("../parsers/__tests__/fixtures/smart.log", import.meta.url), "utf8"));
  const byName = Object.fromEntries(disks.map((d) => [d.name, assessSmart(d)]));

  // 4.46% per year, no errors
  expect(byName.d1).toEqual({ level: "ok", reasons: [] });
  // Failing prefail attribute, 1024 reallocated sectors and 40.5% per year
  expect(byName.d2.level).toEqual("critical");
  expect(byName.d2.reasons).toEqual([
    { kind: "status", status: "FAIL" },
    { kind: "sectors", attribute: "reallocated", count: 1024 },
    { kind: "errors", attribute: "crc", count: 12 },
    { kind: "failure_probability", percent: 40.55 },
  ]);
  // Error log entries only, NVMe error log entries alone are no problem
  expect(byName.parity).toEqual({ level: "warning", reasons: [{ kind: "status", status: "LOGERR" }] });
  // smartctl could not open it, so it is not monitored
  expect(byName.d3).toEqual({ level: "warning", reasons: [{ kind: "unreadable" }] });

  expect(smartHints([byName.d2])).toEqual(["replace", "cable"]);
  expect(smartHints([byName.d3])).toEqual(["access"]);
});

test("assessSmart - a sleeping disk is not unreadable, worn SSDs and media errors are problems", () => {
  expect(assessSmart(disk({ status: "UNKNOWN", standby: true })).level).toEqual("ok");
  expect(assessSmart(disk({ wearLevel: 79 })).level).toEqual("ok");
  expect(assessSmart(disk({ wearLevel: 85 })).reasons).toEqual([{ kind: "wear", percent: 85 }]);
  expect(assessSmart(disk({ wearLevel: 104 })).level).toEqual("critical");
  expect(assessSmart(disk({ errorMedium: 2, errorProtocol: 500 })).reasons).toEqual([
    { kind: "errors", attribute: "medium", count: 2 },
  ]);
});

test("attributeLevel - failed and watched attributes stand out", () => {
  const attribute = { id: 1, name: "Raw_Read_Error_Rate", value: 100, worst: 100, threshold: 6, raw: "123456", flag: "" };
  expect(attributeLevel(attribute)).toEqual("ok");
  expect(attributeLevel({ ...attribute, whenFailed: "past" })).toEqual("warning");
  expect(attributeLevel({ ...attribute, whenFailed: "now" })).toEqual("critical");
  expect(attributeLevel({ ...attribute, id: 197, raw: "8" })).toEqual("warning");
  expect(attributeLevel({ ...attribute, id: 197, raw: "0" })).toEqual("ok");
});

test("heartbeat - pinged after a successful scheduled run only", async () => {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, heartbeat: { enabled: true, url: "http://hc/ping" } };
  let pings = 0;
  const run = (reports: Parameters<typeof heartbeatAfterRun>[0], notRun: string[] = [], enabled = true) =>
    heartbeatAfterRun(
      reports,
      notRun,
      () => Promise.resolve({ ...settings, heartbeat: { ...settings.heartbeat, enabled } }),
      () => {
        pings++;
        return Promise.resolve();
      },
    );
  const ok = parseRunReport("sync", SYNC_LOG, { exitCode: 0 }, 1);

  await run([ok]);
  expect(pings).toEqual(1);
  await run([ok, failedReport("scrub", "boom")]);
  await run([ok], ["scrub"]);
  await run([]);
  await run([ok], [], false);
  expect(pings).toEqual(1);
});

test("heartbeat - a plain GET, an error status is a failed ping", async () => {
  const requests: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response(null, { status: new URL(request.url).pathname === "/down" ? 404 : 200 });
    },
  });
  const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;
  try {
    await pingHeartbeat({ ...DEFAULT_NOTIFICATION_SETTINGS, heartbeat: { enabled: true, url: url("/ping/abc") } });
    let failed = false;
    await pingHeartbeat({ ...DEFAULT_NOTIFICATION_SETTINGS, heartbeat: { enabled: true, url: url("/down") } })
      .catch(() => (failed = true));
    expect(requests).toEqual(["GET /ping/abc", "GET /down"]);
    expect(failed).toBeTruthy();
  } finally {
    await server.stop();
  }
});

test("validateNotificationSettings - the heartbeat needs an http(s) URL", () => {
  const heartbeat = (url: string) => ({ ...DEFAULT_NOTIFICATION_SETTINGS, heartbeat: { enabled: true, url } });
  expect(typeof validateNotificationSettings(heartbeat("hc-ping.com/abc"))).toEqual("string");
  expect(validateNotificationSettings(heartbeat("https://hc-ping.com/abc"))).toEqual(null);
});
