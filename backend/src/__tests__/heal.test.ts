import { assertEquals } from "@std/assert";
import type { RunResult, SnapRaidCommand } from "@shared/types.ts";
import type { JobOutcome } from "../engine/engine.ts";
import { heal } from "../routes/snapraid.ts";

const outcome = (command: SnapRaidCommand, result: RunResult): JobOutcome => ({
  output: { command, output: "", timestamp: "", exitCode: result === "ok" ? 0 : 1 },
  report: { command, result, durationSec: 0, ioErrors: 0, dataErrors: 0, log: "" },
});

const runner = (fixResult: RunResult | null) => {
  const ran: string[] = [];
  const run = (command: SnapRaidCommand, args: string[]) => {
    ran.push([command, ...args].join(" "));
    if (command === "fix") return Promise.resolve(fixResult && outcome(command, fixResult));
    return Promise.resolve(outcome(command, "ok"));
  };
  return { ran, run };
};

Deno.test("heal - repairs the bad blocks, then checks them again", async () => {
  const { ran, run } = runner("ok");
  assertEquals(await heal("/cfg", run, () => false), ["fix", "scrub"]);
  assertEquals(ran, ["fix -e", "scrub -p bad"]);
});

Deno.test("heal - no scrub after a failed fix, nor when another job started", async () => {
  const failed = runner("error");
  await heal("/cfg", failed.run, () => false);
  assertEquals(failed.ran, ["fix -e"]);

  const notRun = runner(null);
  await heal("/cfg", notRun.run, () => false);
  assertEquals(notRun.ran, ["fix -e"]);

  const busy = runner("ok");
  await heal("/cfg", busy.run, () => true);
  assertEquals(busy.ran, ["fix -e"]);
});
