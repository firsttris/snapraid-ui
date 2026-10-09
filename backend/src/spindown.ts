// Spins disks down after a while without reads or writes, like hd-idle.
// Activity comes from the kernel's I/O counters in /proc/diskstats. A partition's counters
// are preferred: SMART reads and power state probes count as I/O of the whole disk only,
// they would otherwise keep it awake forever.
import type { DeviceInfo, SpindownDisk, SpindownStatus } from "@shared/types.ts";
import { loadAppConfig } from "./config-parser.ts";
import { resolveFromBase } from "./config.ts";
import { executeSnapraidCommand } from "./executors/command-executor.ts";
import { parseDevicesOutput } from "./parsers/devices-parser.ts";
import { loadMaintenanceSettings } from "./maintenance-settings.ts";
import { DEMO_MODE, demoDevices, demoDiskstats } from "./demo.ts";
import { selfTestRunning } from "./smart-selftest.ts";

const TICK_MS = 60_000;
// Disks rarely move between devices; read the mapping again now and then and after a failed spindown
const DEVICES_MAX_AGE_MS = 30 * 60_000;
const DISKSTATS = "/proc/diskstats";

/**
 * Reads and writes completed per device, keyed by "major:minor"
 */
export const parseDiskstats = (text: string): Map<string, string> =>
  new Map(
    text.split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((fields) => fields.length >= 8)
      .map((fields) => [`${fields[0]}:${fields[1]}`, `${fields[3]}/${fields[7]}`]),
  );

export interface WatchedDisk extends SpindownDisk {
  counters: string;
}

const keyOf = (configPath: string, disk: string) => `${configPath}|${disk}`;

/**
 * Next state of the watched disks from fresh counters, and the disks idle long enough to spin down.
 * A disk is idle once its counters have not changed for `idleMs`; it is spun down only once,
 * new activity wakes it and starts the wait again.
 */
export const updateWatchedDisks = (
  previous: Map<string, WatchedDisk>,
  devices: Array<{ configPath: string; devices: DeviceInfo[] }>,
  stats: Map<string, string>,
  now: Date,
  idleMs: number,
): { disks: Map<string, WatchedDisk>; idle: WatchedDisk[] } => {
  const disks = new Map<string, WatchedDisk>();
  devices.forEach(({ configPath, devices }) =>
    devices.forEach((device) => {
      const counters = stats.get(device.partMajorMinor) ?? stats.get(device.majorMinor);
      if (counters === undefined) return;
      const key = keyOf(configPath, device.diskName);
      const before = previous.get(key);
      const active = !before || before.counters !== counters || before.device !== device.device;
      disks.set(key, {
        configPath,
        disk: device.diskName,
        device: device.device,
        counters,
        lastActivity: active ? now.toISOString() : before.lastActivity,
        spunDownAt: active ? undefined : before.spunDownAt,
      });
    })
  );

  const idle = [...disks.values()].filter((disk) =>
    !disk.spunDownAt && now.getTime() - new Date(disk.lastActivity).getTime() >= idleMs
  );
  return { disks, idle };
};

/**
 * Watches the disks of the enabled configs and spins them down once idle
 */
export const createSpindownMonitor = (isBusy: () => boolean) => {
  let watched = new Map<string, WatchedDisk>();
  let devices: { readAt: number; list: Array<{ configPath: string; devices: DeviceInfo[] }> } | null = null;
  let error: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const readDevices = async () => {
    if (devices && Date.now() - devices.readAt < DEVICES_MAX_AGE_MS) return devices.list;
    const config = await loadAppConfig();
    const list = await Promise.all(
      config.snapraidConfigs
        .filter((entry) => entry.enabled)
        .map(async (entry) => {
          const configPath = resolveFromBase(entry.path);
          if (DEMO_MODE) return { configPath, devices: await demoDevices(configPath) };
          const { stdout } = await executeSnapraidCommand(["devices", "-c", configPath]);
          return { configPath, devices: parseDevicesOutput(stdout) };
        }),
    );
    devices = { readAt: Date.now(), list };
    return list;
  };

  const spinDown = async (disks: WatchedDisk[], now: Date) => {
    const byConfig = Map.groupBy(disks, (disk) => disk.configPath);
    for (const [configPath, group] of byConfig) {
      const filter = group.flatMap((disk) => ["-d", disk.disk]);
      // The demo sandbox has no devices to send to sleep
      const { stderr } = DEMO_MODE
        ? { stderr: "" }
        : await executeSnapraidCommand(["down", "-c", configPath, ...filter]);
      // down reports a failed disk on stderr and keeps going with the others; it is not retried
      // until it was active again, the device mapping may be outdated
      if (/error|fail/i.test(stderr)) {
        console.error(`Spindown of ${group.map((disk) => disk.disk).join(", ")} reported: ${stderr.trim()}`);
        devices = null;
      }
      console.log(`💤 Spun down ${group.map((disk) => `${disk.disk} (${disk.device})`).join(", ")}`);
      group.forEach((disk) => {
        const entry = watched.get(keyOf(disk.configPath, disk.disk));
        if (entry) entry.spunDownAt = now.toISOString();
      });
    }
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { spindown } = await loadMaintenanceSettings();
      if (!spindown.enabled) {
        watched = new Map();
        error = undefined;
        return;
      }
      // A job reads the disks anyway, and SnapRAID holds its lock
      if (isBusy()) return;

      const watchedDevices = await readDevices();
      let stats: Map<string, string>;
      try {
        stats = parseDiskstats(
          DEMO_MODE
            ? demoDiskstats(watchedDevices.flatMap((entry) => entry.devices))
            : await Deno.readTextFile(DISKSTATS),
        );
      } catch (readError) {
        error = `Cannot read ${DISKSTATS}: ${readError instanceof Error ? readError.message : readError}`;
        return;
      }
      const now = new Date();
      const result = updateWatchedDisks(watched, watchedDevices, stats, now, spindown.idleMinutes * 60_000);
      watched = result.disks;
      error = undefined;
      // Sleep would abort a SMART self-test, which doesn't count as I/O
      const idle = result.idle.filter((disk) => !selfTestRunning(disk.device, now.getTime()));
      if (idle.length > 0 && !isBusy()) await spinDown(idle, now);
    } catch (tickError) {
      error = tickError instanceof Error ? tickError.message : String(tickError);
      console.error("Spindown check failed:", tickError);
    } finally {
      running = false;
    }
  };

  return {
    start: () => {
      if (timer === undefined) timer = setInterval(tick, TICK_MS);
      tick();
    },
    stop: () => {
      clearInterval(timer);
      timer = undefined;
    },
    // Settings or configs changed, read the devices again on the next check
    refresh: () => {
      devices = null;
      tick();
    },
    status: async (): Promise<SpindownStatus> => {
      const { spindown } = await loadMaintenanceSettings();
      return {
        enabled: spindown.enabled,
        idleMinutes: spindown.idleMinutes,
        disks: [...watched.values()].map(({ counters: _, ...disk }) => disk),
        error,
      };
    },
  };
};

export type SpindownMonitor = ReturnType<typeof createSpindownMonitor>;
