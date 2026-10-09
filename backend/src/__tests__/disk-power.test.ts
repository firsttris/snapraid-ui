import { assertEquals } from "@std/assert";
import { powerArgs, setDiskPower } from "../disk-power.ts";

Deno.test("powerArgs - one disk, several, or the whole array", () => {
  assertEquals(powerArgs("down", "/cfg/snapraid.conf", ["d1"]), ["down", "-c", "/cfg/snapraid.conf", "-d", "d1"]);
  assertEquals(powerArgs("up", "/cfg/snapraid.conf", ["d1", "parity"]), [
    "up", "-c", "/cfg/snapraid.conf", "-d", "d1", "-d", "parity",
  ]);
  assertEquals(powerArgs("up", "/cfg/snapraid.conf", []), ["up", "-c", "/cfg/snapraid.conf"]);
});

Deno.test("setDiskPower - SnapRAID's last line when it failed, nothing when it worked", async () => {
  const ran: string[][] = [];
  const run = (code: number, stdout: string, stderr = "") => (args: string[]) => {
    ran.push(args);
    return Promise.resolve({ stdout, stderr, code });
  };
  assertEquals(await setDiskPower("down", "/cfg", ["d1"], run(0, "Spindown...\n")), null);
  assertEquals(
    await setDiskPower("down", "/cfg", ["d1"], run(1, "Spindown...\n", "Cannot find smartctl.\nSpindown is unsupported in this platform.\n")),
    "Spindown is unsupported in this platform.",
  );
  assertEquals(await setDiskPower("up", "/cfg", [], run(2, "")), "snapraid up failed (exit code 2)");
  assertEquals(ran.length, 3);
});
