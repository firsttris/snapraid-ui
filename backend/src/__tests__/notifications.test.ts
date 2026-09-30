import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type Schedule, SECRET_MASK, type SmartDiskInfo } from "@shared/types.ts";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  maskSecrets,
  resolveSecrets,
  validateNotificationSettings,
} from "../notifications.ts";
import { buildRunNotification, buildSkipNotification, diffSmartProblems } from "../notification-events.ts";
import { failedReport, parseRunReport } from "../run-report.ts";
import { combineResults, scheduleSteps } from "../scheduler.ts";
import { assessSmart } from "@shared/smart-health.ts";
import { parseSmartOutput } from "../parsers/smart-parser.ts";

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

Deno.test("parseRunReport - reads result, changes and errors from the structured log", () => {
  const sync = parseRunReport("sync", SYNC_LOG, ok, 90);
  assertEquals(sync.result, "ok");
  assertEquals(sync.changes, { added: 12, removed: 1, updated: 3, moved: 3, copied: 0 });

  const scrub = parseRunReport("scrub", SCRUB_BAD_LOG, { exitCode: 1 }, 10);
  assertEquals([scrub.result, scrub.ioErrors, scrub.dataErrors], ["error", 1, 4]);

  assertEquals(parseRunReport("sync", "", { exitCode: 1 }, 0).result, "error");
  // A sync log without summary stopped early, touch never writes one
  assertEquals(parseRunReport("sync", "command:sync", ok, 0).result, "incomplete");
  assertEquals(parseRunReport("touch", "command:touch", ok, 0).result, "ok");
  // fix repaired everything it found
  assertEquals(parseRunReport("fix", "summary:error_recovered:135\nsummary:exit:recovered", ok, 0).result, "ok");
  assertEquals(parseRunReport("fix", "summary:exit:unrecoverable", { exitCode: 1 }, 0).result, "error");
  assertEquals(parseRunReport("touch", `command:touch\n${FATAL_LOG}`, { exitCode: 1 }, 0).result, "error");
  assertEquals(parseRunReport("sync", SYNC_LOG, { exitCode: 0, aborted: true }, 0).result, "aborted");
});

Deno.test("buildRunNotification - data errors win over success and failure", () => {
  const notification = buildRunNotification("en", "Nightly", "/cfg/snapraid.conf", [
    parseRunReport("sync", SYNC_LOG, ok, 90),
    parseRunReport("scrub", SCRUB_BAD_LOG, { exitCode: 1 }, 3700),
  ]);

  assertEquals(notification?.event, "data_errors");
  assertEquals(notification?.title, "Data errors found: Nightly");
  assertStringIncludes(notification!.message, "Sync: OK (2 min)\n  12 added, 3 updated, 1 removed, 3 moved");
  assertStringIncludes(notification!.message, "Scrub: failed (1 h 2 min)\n  1 I/O errors, 4 data errors");
  assertStringIncludes(notification!.message, "Config: snapraid.conf");
});

Deno.test("buildRunNotification - reports failures with SnapRAID's reason and skipped steps", () => {
  const notification = buildRunNotification(
    "de",
    "Nacht",
    "/cfg/snapraid.conf",
    [parseRunReport("sync", FATAL_LOG, { exitCode: 1 }, 5)],
    ["scrub"],
  );

  assertEquals(notification?.event, "job_failed");
  assertEquals(notification?.title, "Fehlgeschlagen: Nacht");
  assertStringIncludes(notification!.message, "Disk '/mnt/disk1/' with uuid 'x' not present");
  assertStringIncludes(notification!.message, "Scrub: nicht ausgeführt");
});

Deno.test("buildRunNotification - success, commands that never started and aborted runs", () => {
  assertEquals(
    buildRunNotification("en", "x", "c", [parseRunReport("sync", SYNC_LOG, ok, 1)])?.event,
    "job_succeeded",
  );

  const failed = buildRunNotification("en", "x", "c", [failedReport("sync", "spawn failed")]);
  assertEquals(failed?.event, "job_failed");
  assertStringIncludes(failed!.message, "spawn failed");

  assertEquals(
    buildRunNotification("en", "x", "c", [parseRunReport("sync", SYNC_LOG, { exitCode: 0, aborted: true }, 1)]),
    null,
  );
});

Deno.test("buildSkipNotification - explains the sync guard", () => {
  const notification = buildSkipNotification("en", "Nightly", "/cfg/snapraid.conf", {
    timestamp: "",
    result: "skipped",
    skipReason: "too_many_deleted",
    deletedFiles: 812,
  }, 50);

  assertEquals(notification.event, "schedule_skipped");
  assertStringIncludes(notification.message, "812 deleted files, more than the limit of 50");
});

const disk = (overrides: Partial<SmartDiskInfo>): SmartDiskInfo => ({
  name: "d1",
  device: "/dev/sda",
  serial: "S1",
  status: "OK",
  failureProbability: 4,
  ...overrides,
});

Deno.test("diffSmartProblems - reports a disk once per problem and forgets it when healthy", () => {
  const cfg = "/cfg/a.conf";
  const failing = disk({ status: "PREFAIL", failureProbability: 40 });

  const first = diffSmartProblems(cfg, [failing, disk({ name: "d2", serial: "S2" })], 25, {});
  assertEquals(first.report.map((r) => r.disk.name), ["d1"]);

  const again = diffSmartProblems(cfg, [failing], 25, first.state);
  assertEquals(again.report, []);

  const worse = diffSmartProblems(cfg, [{ ...failing, status: "FAIL" }], 25, again.state);
  assertEquals(worse.report.map((r) => r.disk.status), ["FAIL"]);

  const healthy = diffSmartProblems(cfg, [disk({})], 25, worse.state);
  assertEquals(healthy.state, {});
});

const sectors = (reallocated: number) =>
  disk({
    attributes: [
      { id: 5, name: "Reallocated_Sector_Ct", value: 100, worst: 100, threshold: 10, raw: String(reallocated), flag: "" },
    ],
  });

Deno.test("diffSmartProblems - a growing sector count is reported again, a drifting temperature is not", () => {
  const cfg = "/cfg/a.conf";
  const first = diffSmartProblems(cfg, [sectors(8)], 25, {});
  assertEquals(first.report[0].assessment.reasons, [{ kind: "sectors", attribute: "reallocated", count: 8 }]);
  assertEquals(diffSmartProblems(cfg, [sectors(8)], 25, first.state).report, []);
  assertEquals(diffSmartProblems(cfg, [sectors(16)], 25, first.state).report.length, 1);

  const hot = diffSmartProblems(cfg, [disk({ temperature: 52 })], 25, {});
  assertEquals(diffSmartProblems(cfg, [disk({ temperature: 54 })], 25, hot.state).report, []);
});

Deno.test("diffSmartProblems - keeps the state of other configs", () => {
  const other = { "/cfg/b.conf|d1|S1": "FAIL|true" };
  const { state } = diffSmartProblems("/cfg/a.conf", [], 25, other);
  assertEquals(state, other);
});

Deno.test("secrets - masked on the way out, kept when the mask comes back", () => {
  const stored = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    email: { ...DEFAULT_NOTIFICATION_SETTINGS.email, password: "hunter2" },
    ntfy: { ...DEFAULT_NOTIFICATION_SETTINGS.ntfy, token: "tk_1" },
  };

  const masked = maskSecrets(stored);
  assertEquals([masked.email.password, masked.ntfy.token], [SECRET_MASK, SECRET_MASK]);

  const resolved = resolveSecrets(masked, stored);
  assertEquals([resolved.email.password, resolved.ntfy.token], ["hunter2", "tk_1"]);

  const cleared = resolveSecrets({ ...masked, ntfy: { ...masked.ntfy, token: "" } }, stored);
  assertEquals(cleared.ntfy.token, "");
});

Deno.test("validateNotificationSettings - enabled channels need their fields", () => {
  assertEquals(validateNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS), null);
  assert(validateNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ntfy: { ...DEFAULT_NOTIFICATION_SETTINGS.ntfy, enabled: true },
  }));
  assert(validateNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    webhook: { enabled: true, url: "ftp://x" },
  }));
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

Deno.test("scheduleSteps - touch before and scrub after a sync", () => {
  assertEquals(
    scheduleSteps(schedule({ touchBefore: true, scrubAfter: ["-p", "8", "-o", "10"] })),
    [
      { command: "touch", args: [] },
      { command: "sync", args: [] },
      { command: "scrub", args: ["-p", "8", "-o", "10"] },
    ],
  );
  // Only sync schedules chain commands
  assertEquals(
    scheduleSteps(schedule({ command: "scrub", args: ["-p", "new"], touchBefore: true, scrubAfter: [] })),
    [{ command: "scrub", args: ["-p", "new"] }],
  );
  assertEquals(scheduleSteps(schedule({ scrubAfter: null })).length, 1);
});

Deno.test("combineResults - first failure, otherwise the worst of ok and warning", () => {
  assertEquals(combineResults(["ok", "ok"]), "ok");
  assertEquals(combineResults(["ok", "warning", "ok"]), "warning");
  assertEquals(combineResults(["warning", "error"]), "error");
  assertEquals(combineResults(["ok", "aborted"]), "aborted");
});

Deno.test("assessSmart - a few percent failure probability is normal, sectors and status are not", () => {
  const disks = parseSmartOutput(Deno.readTextFileSync(new URL("../parsers/__tests__/fixtures/smart.log", import.meta.url)));
  const byName = Object.fromEntries(disks.map((d) => [d.name, assessSmart(d)]));

  // 4.46% per year, no errors
  assertEquals(byName.d1, { level: "ok", reasons: [] });
  // Failing prefail attribute, 1024 reallocated sectors and 40.5% per year
  assertEquals(byName.d2.level, "critical");
  assertEquals(byName.d2.reasons, [
    { kind: "status", status: "FAIL" },
    { kind: "sectors", attribute: "reallocated", count: 1024 },
    { kind: "failure_probability", percent: 40.55 },
  ]);
  // Error log entries only
  assertEquals(byName.parity, { level: "warning", reasons: [{ kind: "status", status: "LOGERR" }] });
});
