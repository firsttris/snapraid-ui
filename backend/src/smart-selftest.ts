// SMART self-tests: the disk's firmware checks itself, a short test in a few minutes, a long
// (extended) one reads the whole surface and takes hours. Started with `smartctl -t`, the disk
// runs it on its own; its status and the log of the last tests come from `smartctl -c -l selftest`.
// smartctl's JSON output (-j) covers ATA and NVMe disks alike.
import type { DeviceInfo, DiskSelfTest, SelfTestLogEntry, SelfTestType } from "@shared/types.ts";
import { executeSnapraidCommand } from "./executors/command-executor.ts";
import { parseDevicesOutput } from "./parsers/devices-parser.ts";
import { DEMO_MODE, demoDevices, demoDisks } from "./demo.ts";

// The image installs smartmontools; tests point it to a stand-in
const smartctlBin = () => Deno.env.get("SMARTCTL_BIN") ?? "smartctl";

// smartctl exit status: bit 0 command line, bit 1 device could not be opened (or is asleep
// with -n standby), bit 2 a command to the disk failed
const FAILED_BITS = 0b111;

export interface SmartctlJson {
  smartctl?: { exit_status?: number; messages?: Array<{ string?: string; severity?: string }> };
  ata_smart_data?: {
    self_test?: {
      status?: { value?: number; string?: string; remaining_percent?: number; passed?: boolean };
      polling_minutes?: { short?: number; extended?: number };
    };
    capabilities?: { self_tests_supported?: boolean };
  };
  ata_smart_self_test_log?: {
    standard?: {
      table?: Array<{
        type?: { value?: number; string?: string };
        status?: { value?: number; string?: string; passed?: boolean };
        lifetime_hours?: number;
      }>;
    };
  };
  nvme_self_test_log?: {
    current_self_test_operation?: { value?: number; string?: string };
    current_self_test_completion_percent?: number;
    table?: Array<{
      self_test_code?: { value?: number; string?: string };
      self_test_result?: { value?: number; string?: string };
      power_on_hours?: number;
    }>;
  };
}

const messagesOf = (json: SmartctlJson) =>
  (json.smartctl?.messages ?? []).map((message) => message.string ?? "").filter(Boolean);

// The wording is the same for ATA and NVMe; aborted or interrupted tests found nothing
const resultOf = (status: string, passed: boolean | undefined): SelfTestLogEntry["result"] =>
  /abort|interrupt/i.test(status) ? "aborted" : passed ?? /without error/i.test(status) ? "passed" : "failed";

const kindOf = (type: string): SelfTestLogEntry["kind"] =>
  /^short/i.test(type) ? "short" : /^(extended|long)/i.test(type) ? "long" : "other";

/**
 * Status and log of a disk's self-tests from `smartctl -j -n standby -c -l selftest`
 */
export const parseSelfTest = (json: SmartctlJson): Omit<DiskSelfTest, "disk" | "device"> => {
  const messages = messagesOf(json);
  // -n standby leaves a sleeping disk alone and says so
  if (messages.some((message) => /STANDBY|SLEEP/i.test(message)) && !json.ata_smart_data && !json.nvme_self_test_log) {
    return { supported: true, standby: true, log: [] };
  }

  const nvme = json.nvme_self_test_log;
  if (nvme) {
    const operation = nvme.current_self_test_operation?.value ?? 0;
    return {
      // Only disks that support self-tests have the log
      supported: true,
      ...(operation !== 0
        ? {
          running: nvme.current_self_test_completion_percent !== undefined
            ? { remainingPercent: 100 - nvme.current_self_test_completion_percent }
            : {},
        }
        : {}),
      log: (nvme.table ?? []).map((entry) => {
        const type = entry.self_test_code?.string ?? "";
        return {
          type,
          kind: kindOf(type),
          result: resultOf(entry.self_test_result?.string ?? "", (entry.self_test_result?.value ?? 0) === 0),
          status: entry.self_test_result?.string ?? "",
          ...(entry.power_on_hours !== undefined ? { powerOnHours: entry.power_on_hours } : {}),
        };
      }),
    };
  }

  const ata = json.ata_smart_data;
  if (ata) {
    const status = ata.self_test?.status;
    // Values 0xF0 to 0xFF: a test is in progress, the low nibble tells how much is left
    const inProgress = status?.value !== undefined && status.value >> 4 === 0xf;
    const minutes = ata.self_test?.polling_minutes;
    return {
      supported: ata.capabilities?.self_tests_supported ?? true,
      ...(inProgress
        ? { running: status?.remaining_percent !== undefined ? { remainingPercent: status.remaining_percent } : {} }
        : {}),
      ...(minutes ? { durations: { short: minutes.short, long: minutes.extended } } : {}),
      log: (json.ata_smart_self_test_log?.standard?.table ?? []).map((entry) => {
        const type = entry.type?.string ?? "";
        return {
          type,
          kind: kindOf(type),
          result: resultOf(entry.status?.string ?? "", entry.status?.passed),
          status: entry.status?.string ?? "",
          ...(entry.lifetime_hours !== undefined ? { powerOnHours: entry.lifetime_hours } : {}),
        };
      }),
    };
  }

  return { supported: false, error: messages.join(" ") || undefined, log: [] };
};

const runSmartctl = async (args: string[]): Promise<{ json: SmartctlJson; exitCode: number }> => {
  const { stdout, code } = await new Deno.Command(smartctlBin(), {
    args: ["-j", ...args],
    stdout: "piped",
    stderr: "null",
  }).output();
  let json: SmartctlJson = {};
  try {
    json = JSON.parse(new TextDecoder().decode(stdout));
  } catch {
    // Not smartctl 7 or newer, or no output at all
  }
  return { json, exitCode: json.smartctl?.exit_status ?? code };
};

// The demo disks: a short test yesterday, a long one two weeks ago, the SSD is in the middle of one
const demoSelfTest = (disk: { powerOnHours: number; standby?: boolean; rotationRate?: number }): Omit<DiskSelfTest, "disk" | "device"> =>
  disk.standby ? { supported: true, standby: true, log: [] } : {
    supported: true,
    ...(disk.rotationRate === 0 ? { running: { remainingPercent: 60 } } : {}),
    durations: { short: 2, long: disk.rotationRate === 0 ? 30 : 900 },
    log: [
      { type: "Short offline", kind: "short", result: "passed", status: "Completed without error", powerOnHours: disk.powerOnHours - 20 },
      { type: "Extended offline", kind: "long", result: "passed", status: "Completed without error", powerOnHours: disk.powerOnHours - 340 },
    ],
  };

/**
 * Disks of a config and their devices, as `snapraid devices` maps them
 */
export const arrayDevices = async (configPath: string): Promise<DeviceInfo[]> => {
  if (DEMO_MODE) return demoDevices(configPath);
  const { stdout } = await executeSnapraidCommand(["devices", "-c", configPath]);
  return parseDevicesOutput(stdout);
};

// Devices with a test this UI started, until it should be done: the spindown leaves them alone,
// sending a disk to sleep aborts its test
const running = new Map<string, number>();
const LONG_TEST_FALLBACK_MINUTES = 24 * 60;

export const selfTestRunning = (device: string, now = Date.now()): boolean => (running.get(device) ?? 0) > now;

const track = (device: string, test: Omit<DiskSelfTest, "disk" | "device">) => {
  if (test.running) {
    // Still at it: give it what is left of the long test's time, at least an hour
    const left = Math.max(60, ((test.durations?.long ?? LONG_TEST_FALLBACK_MINUTES) * (test.running.remainingPercent ?? 100)) / 100);
    running.set(device, Date.now() + left * 60_000);
  } else if (!test.standby) {
    running.delete(device);
  }
};

/**
 * Self-test status and log of every disk of a config; sleeping disks are not woken
 */
export const readSelfTests = async (configPath: string): Promise<DiskSelfTest[]> => {
  const devices = await arrayDevices(configPath);
  const demo = DEMO_MODE ? await demoDisks(configPath) : [];
  const results: DiskSelfTest[] = [];
  for (const device of devices) {
    const base = { disk: device.diskName, device: device.device };
    const demoDisk = demo.find((disk) => disk.name === device.diskName);
    if (demoDisk) {
      results.push({ ...base, ...demoSelfTest(demoDisk) });
      continue;
    }
    try {
      const { json } = await runSmartctl(["-n", "standby", "-c", "-l", "selftest", device.device]);
      const test = parseSelfTest(json);
      track(device.device, test);
      results.push({ ...base, ...test });
    } catch (error) {
      results.push({ ...base, supported: false, error: error instanceof Error ? error.message : String(error), log: [] });
    }
  }
  return results;
};

/**
 * Start (or with "abort" stop) the self-test of these disks; a disk that refuses is reported by name
 */
export const controlSelfTests = async (
  configPath: string,
  disks: string[],
  action: SelfTestType | "abort",
): Promise<Array<{ disk: string; error: string }>> => {
  const devices = (await arrayDevices(configPath)).filter((device) => disks.includes(device.diskName));
  const failed: Array<{ disk: string; error: string }> = [];
  // Disks of one device (directories on one filesystem) get one command
  for (const device of new Map(devices.map((entry) => [entry.device, entry])).values()) {
    if (DEMO_MODE) continue;
    const args = action === "abort" ? ["-X", device.device] : ["-t", action, device.device];
    try {
      const { json, exitCode } = await runSmartctl(args);
      if (exitCode & FAILED_BITS) {
        failed.push({ disk: device.diskName, error: messagesOf(json).join(" ") || `smartctl exit status ${exitCode}` });
      } else if (action === "abort") {
        running.delete(device.device);
      } else {
        running.set(device.device, Date.now() + (action === "long" ? LONG_TEST_FALLBACK_MINUTES : 60) * 60_000);
      }
    } catch (error) {
      failed.push({ disk: device.diskName, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failed;
};
