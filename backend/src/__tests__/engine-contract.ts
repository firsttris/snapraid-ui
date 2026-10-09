// What every engine (engine/engine.ts) has to do, run against each of them:
// the fake one always, the CLI one when a SnapRAID binary is available.
// A new engine, e.g. one on snapraid-daemon's REST API, gets the same tests.
import { assert, assertEquals, assertRejects } from "@std/assert";
import { EngineBusyError, type SnapRaidEngine } from "../engine/engine.ts";

export interface ContractSetup {
  engine: SnapRaidEngine;
  configPath: string;
  dataDisks: string[];
  addFile: (name: string) => Promise<void> | void; // A new file on the first data disk
  cleanup?: () => Promise<void>;
}

export const engineContract = (name: string, setup: () => Promise<ContractSetup>, ignore = false) =>
  Deno.test({
    name: `engine contract: ${name}`,
    ignore,
    // The CLI engine spawns SnapRAID and keeps timers for its progress
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async (t) => {
      const { engine, configPath, dataDisks, addFile, cleanup } = await setup();
      try {
        await t.step("a sync succeeds and the job is no longer current", async () => {
          const outcome = await engine.runJob({ command: "sync", configPath });
          assertEquals(outcome.report.result, "ok");
          assertEquals(outcome.output.exitCode, 0);
          assertEquals(engine.currentJob(), null);
          assertEquals(engine.lastJob()?.command, "sync");
        });

        await t.step("the status describes the data disks", async () => {
          const { status } = await engine.readStatus(configPath);
          assertEquals(status.disks?.map((disk) => disk.name).sort(), [...dataDisks].sort());
          assertEquals(status.diskIssues, []);
          assert(!status.hasErrors);
        });

        await t.step("the diff lists a new file, a sync records it", async () => {
          await addFile("new-file.bin");
          const before = await engine.readDiff(configPath);
          assertEquals(before.newFiles, 1);
          assert(before.files.some((file) => file.name.endsWith("new-file.bin")));

          await engine.runJob({ command: "sync", configPath });
          assertEquals((await engine.readDiff(configPath)).newFiles, 0);
        });

        await t.step("afterRun runs while the job is current, the status waits for it", async () => {
          let current = null as ReturnType<SnapRaidEngine["currentJob"]>;
          await engine.runJob({
            command: "scrub",
            configPath,
            args: ["-p", "new"],
            afterRun: async () => {
              current = engine.currentJob();
              const error = await assertRejects(() => engine.readStatus(configPath), EngineBusyError);
              assertEquals(error.reason, "job");
            },
          });
          assertEquals(current?.command, "scrub");
        });

        await t.step("output goes to onOutput", async () => {
          const chunks: string[] = [];
          await engine.runJob({ command: "diff", configPath, onOutput: (chunk) => chunks.push(chunk) });
          assert(chunks.join("").length > 0);
        });

        await t.step("abort without a running job does nothing", () => {
          assertEquals(engine.abortJob("nothing-1"), false);
        });
      } finally {
        await cleanup?.();
      }
    },
  });
