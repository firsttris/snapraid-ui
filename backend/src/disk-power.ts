// Spin disks up or down by hand, with SnapRAID's `up` and `down` (smartctl and hdparm under the
// hood). Like the automatic spindown this calls SnapRAID directly, also in daemon mode.
import { executeSnapraidCommand } from "./executors/command-executor.ts";
import { DEMO_MODE } from "./demo.ts";

export type PowerAction = "up" | "down";

/**
 * SnapRAID's arguments; no disks means all disks of the array
 */
export const powerArgs = (action: PowerAction, configPath: string, disks: string[]): string[] => [
  action,
  "-c",
  configPath,
  ...disks.flatMap((disk) => ["-d", disk]),
];

/**
 * Runs `snapraid up|down`; resolves with SnapRAID's last words when it failed, e.g.
 * "Spindown is unsupported in this platform." without smartctl
 */
export const setDiskPower = async (
  action: PowerAction,
  configPath: string,
  disks: string[],
  run: (args: string[]) => Promise<{ stdout: string; stderr: string; code: number }> = executeSnapraidCommand,
): Promise<string | null> => {
  if (DEMO_MODE) return null;
  const { stdout, stderr, code } = await run(powerArgs(action, configPath, disks));
  if (code === 0) return null;
  const lines = `${stdout}\n${stderr}`.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? `snapraid ${action} failed (exit code ${code})`;
};
