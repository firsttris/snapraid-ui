import { expect, test } from "bun:test";
import { powerArgs, setDiskPower } from "../disk-power.ts";

test("powerArgs - one disk, several, or the whole array", () => {
  expect(powerArgs("down", "/cfg/snapraid.conf", ["d1"])).toEqual(["down", "-c", "/cfg/snapraid.conf", "-d", "d1"]);
  expect(powerArgs("up", "/cfg/snapraid.conf", ["d1", "parity"])).toEqual([
    "up", "-c", "/cfg/snapraid.conf", "-d", "d1", "-d", "parity",
  ]);
  expect(powerArgs("up", "/cfg/snapraid.conf", [])).toEqual(["up", "-c", "/cfg/snapraid.conf"]);
});

test("setDiskPower - SnapRAID's last line when it failed, nothing when it worked", async () => {
  const ran: string[][] = [];
  const run = (code: number, stdout: string, stderr = "") => (args: string[]) => {
    ran.push(args);
    return Promise.resolve({ stdout, stderr, code });
  };
  expect(await setDiskPower("down", "/cfg", ["d1"], run(0, "Spindown...\n"))).toEqual(null);
  expect(await setDiskPower("down", "/cfg", ["d1"], run(1, "Spindown...\n", "Cannot find smartctl.\nSpindown is unsupported in this platform.\n"))).toEqual("Spindown is unsupported in this platform.");
  expect(await setDiskPower("up", "/cfg", [], run(2, ""))).toEqual("snapraid up failed (exit code 2)");
  // SnapRAID 15: done, but a filesystem runs degraded
  expect(await setDiskPower("up", "/cfg", [], run(3, "Spinup...\n"))).toEqual(null);
  expect(ran.length).toEqual(4);
});
