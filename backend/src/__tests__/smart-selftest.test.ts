import { assertEquals } from "@std/assert";
import { parseSelfTest, selfTestRunning, type SmartctlJson } from "../smart-selftest.ts";

// Shaped like `smartctl -j -c -l selftest` of smartmontools 7
// Real output has more fields than the parser reads, they stay in
const ata = (status: object, table: object[] = []): SmartctlJson => ({
  smartctl: { exit_status: 0 },
  ata_smart_data: {
    self_test: { status, polling_minutes: { short: 2, extended: 1124, conveyance: 5 } },
    capabilities: { self_tests_supported: true },
  },
  ata_smart_self_test_log: { standard: { revision: 1, table, count: table.length } },
} as SmartctlJson);

Deno.test("parseSelfTest - ATA: a test in progress, durations and the log, newest first", () => {
  const result = parseSelfTest(ata(
    { value: 249, string: "in progress, 90% remaining", remaining_percent: 90 },
    [
      { type: { value: 1, string: "Short offline" }, status: { value: 0, string: "Completed without error", passed: true }, lifetime_hours: 21_800 },
      { type: { value: 2, string: "Extended offline" }, status: { value: 121, string: "Completed: read failure", remaining_percent: 90, passed: false }, lifetime_hours: 21_100 },
      { type: { value: 2, string: "Extended offline" }, status: { value: 16, string: "Aborted by host", passed: false }, lifetime_hours: 20_500 },
    ],
  ));
  assertEquals(result, {
    supported: true,
    running: { remainingPercent: 90 },
    durations: { short: 2, long: 1124 },
    log: [
      { type: "Short offline", kind: "short", result: "passed", status: "Completed without error", powerOnHours: 21_800 },
      { type: "Extended offline", kind: "long", result: "failed", status: "Completed: read failure", powerOnHours: 21_100 },
      { type: "Extended offline", kind: "long", result: "aborted", status: "Aborted by host", powerOnHours: 20_500 },
    ],
  });
});

Deno.test("parseSelfTest - ATA: nothing running", () => {
  const result = parseSelfTest(ata({ value: 0, string: "completed without error", passed: true }));
  assertEquals(result.running, undefined);
  assertEquals(result.log, []);
});

Deno.test("parseSelfTest - NVMe: running test as completion, results by value", () => {
  const result = parseSelfTest({
    smartctl: { exit_status: 0 },
    nvme_self_test_log: {
      current_self_test_operation: { value: 2, string: "Extended self-test in progress" },
      current_self_test_completion_percent: 30,
      table: [
        { self_test_code: { value: 1, string: "Short" }, self_test_result: { value: 0, string: "Completed without error" }, power_on_hours: 1500 },
        { self_test_code: { value: 2, string: "Extended" }, self_test_result: { value: 7, string: "Completed: failed segments" }, power_on_hours: 1400 },
      ],
    },
  });
  assertEquals(result, {
    supported: true,
    running: { remainingPercent: 70 },
    log: [
      { type: "Short", kind: "short", result: "passed", status: "Completed without error", powerOnHours: 1500 },
      { type: "Extended", kind: "long", result: "failed", status: "Completed: failed segments", powerOnHours: 1400 },
    ],
  });
});

Deno.test("parseSelfTest - a sleeping disk is reported, not read", () => {
  assertEquals(
    parseSelfTest({ smartctl: { exit_status: 2, messages: [{ string: "Device is in STANDBY mode, exit(2)", severity: "information" }] } }),
    { supported: true, standby: true, log: [] },
  );
});

Deno.test("parseSelfTest - no SMART data: not supported, with smartctl's reason", () => {
  assertEquals(
    parseSelfTest({ smartctl: { exit_status: 2, messages: [{ string: "/dev/vda: Unable to detect device type", severity: "error" }] } }),
    { supported: false, error: "/dev/vda: Unable to detect device type", log: [] },
  );
  assertEquals(parseSelfTest({}), { supported: false, error: undefined, log: [] });
});

Deno.test("selfTestRunning - only devices with a test this UI started", () => {
  assertEquals(selfTestRunning("/dev/never-tested"), false);
});
