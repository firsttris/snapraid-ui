import { assertEquals } from "@std/assert";
import type { RunResult, SnapRaidCommand } from "@shared/types.ts";
import type { JobOutcome } from "../engine/engine.ts";
import { exactFilter, restoreFiles, restoreRuns } from "../recovery.ts";

Deno.test("exactFilter - anchored at the disk root, wildcards taken literally", () => {
  assertEquals(exactFilter("photos/2024/holiday.jpg"), "/photos/2024/holiday.jpg");
  assertEquals(exactFilter("/already/rooted.txt"), "/already/rooted.txt");
  assertEquals(exactFilter("x[1] *.bin"), "/x[[]1] [*].bin");
  assertEquals(exactFilter("what?.txt"), "/what[?].txt");
});

Deno.test("restoreRuns - one fix per disk, each path once", () => {
  assertEquals(
    restoreRuns([
      { disk: "d1", path: "a.jpg" },
      { disk: "d2", path: "movies/b.mkv" },
      { disk: "d1", path: "docs/c.pdf" },
      { disk: "d1", path: "a.jpg" },
    ]),
    [
      ["-d", "d1", "-f", "/a.jpg", "-f", "/docs/c.pdf"],
      ["-d", "d2", "-f", "/movies/b.mkv"],
    ],
  );
});

const outcome = (command: SnapRaidCommand, result: RunResult): JobOutcome => ({
  output: { command, output: "", timestamp: "", exitCode: result === "ok" ? 0 : 1 },
  report: { command, result, durationSec: 0, ioErrors: 0, dataErrors: 0, log: "" },
});

Deno.test("restoreFiles - stops after a failed fix and when another job started", async () => {
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
  assertEquals(await restoreFiles(files, all.run, () => false), 3);
  assertEquals(all.ran, ["d1", "d2", "d3"]);

  const failed = runner(["ok", "error"]);
  assertEquals(await restoreFiles(files, failed.run, () => false), 1);
  assertEquals(failed.ran, ["d1", "d2"]);

  const busy = runner([]);
  assertEquals(await restoreFiles(files, busy.run, () => true), 1);
  assertEquals(busy.ran, ["d1"]);
});
