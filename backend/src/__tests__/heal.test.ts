import { expect, test } from "bun:test";
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

test("heal - repairs the bad blocks, then checks them again", async () => {
  const { ran, run } = runner("ok");
  expect(await heal("/cfg", run, () => false)).toEqual(["fix", "scrub"]);
  expect(ran).toEqual(["fix -e", "scrub -p bad"]);
});

test("heal - no scrub after a failed fix, nor when another job started", async () => {
  const failed = runner("error");
  await heal("/cfg", failed.run, () => false);
  expect(failed.ran).toEqual(["fix -e"]);

  const notRun = runner(null);
  await heal("/cfg", notRun.run, () => false);
  expect(notRun.ran).toEqual(["fix -e"]);

  const busy = runner("ok");
  await heal("/cfg", busy.run, () => true);
  expect(busy.ran).toEqual(["fix -e"]);
});
