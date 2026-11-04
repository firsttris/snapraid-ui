import { expect, test } from "bun:test";
import type { RunResult, SnapRaidCommand } from "@shared/types.ts";
import type { JobOutcome } from "../engine/engine.ts";
import { exactFilter, restoreFiles, restoreRuns } from "../recovery.ts";

test("exactFilter - anchored at the disk root, wildcards taken literally", () => {
  expect(exactFilter("photos/2024/holiday.jpg")).toEqual("/photos/2024/holiday.jpg");
  expect(exactFilter("/already/rooted.txt")).toEqual("/already/rooted.txt");
  expect(exactFilter("x[1] *.bin")).toEqual("/x[[]1] [*].bin");
  expect(exactFilter("what?.txt")).toEqual("/what[?].txt");
});

test("restoreRuns - one fix per disk, each path once", () => {
  expect(restoreRuns([
      { disk: "d1", path: "a.jpg" },
      { disk: "d2", path: "movies/b.mkv" },
      { disk: "d1", path: "docs/c.pdf" },
      { disk: "d1", path: "a.jpg" },
    ])).toEqual([
      ["-d", "d1", "-f", "/a.jpg", "-f", "/docs/c.pdf"],
      ["-d", "d2", "-f", "/movies/b.mkv"],
    ]);
});

const outcome = (command: SnapRaidCommand, result: RunResult): JobOutcome => ({
  output: { command, output: "", timestamp: "", exitCode: result === "ok" ? 0 : 1 },
  report: { command, result, durationSec: 0, ioErrors: 0, dataErrors: 0, log: "" },
});

test("restoreFiles - stops after a failed fix and when another job started", async () => {
  const files = [{ disk: "d1", path: "a" }, { disk: "d2", path: "b" }, { disk: "d3", path: "c" }];
  const runner = (results: RunResult[]) => {
    const ran: string[] = [];
    return {
      ran,
      run: (_command: SnapRaidCommand, args: string[]) => {
        ran.push(args[1]);
        return Promise.resolve(outcome("fix", results[ran.length - 1] ?? "ok"));
      },
    };
  };

  const all = runner(["ok", "ok", "ok"]);
  expect(await restoreFiles(files, all.run, () => false)).toEqual(3);
  expect(all.ran).toEqual(["d1", "d2", "d3"]);

  const failed = runner(["ok", "error"]);
  expect(await restoreFiles(files, failed.run, () => false)).toEqual(1);
  expect(failed.ran).toEqual(["d1", "d2"]);

  const busy = runner([]);
  expect(await restoreFiles(files, busy.run, () => true)).toEqual(1);
  expect(busy.ran).toEqual(["d1"]);
});
