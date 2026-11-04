// What every engine (engine/engine.ts) has to do, run against each of them:
// the fake one always, the CLI one when a SnapRAID binary is available.
// A new engine, e.g. one on snapraid-daemon's REST API, gets the same tests.
import { expect, test } from "bun:test";
import { assertRejects } from "./assert-error.ts";
import { EngineBusyError, type SnapRaidEngine } from "../engine/engine.ts";

export interface ContractSetup {
  engine: SnapRaidEngine;
  configPath: string;
  dataDisks: string[];
  addFile: (name: string) => Promise<void> | void; // A new file on the first data disk
  cleanup?: () => Promise<void>;
}

// The steps of one test run in order on the same engine; a failing step names itself
const step = async (name: string, run: () => Promise<void> | void) => {
  try {
    await run();
  } catch (error) {
    throw new Error(`Step "${name}" failed`, { cause: error });
  }
};

export const engineContract = (name: string, setup: () => Promise<ContractSetup>, ignore = false) =>
  test.skipIf(ignore)(
    `engine contract: ${name}`,
    async () => {
      const { engine, configPath, dataDisks, addFile, cleanup } = await setup();
      try {
        await step("a sync succeeds and the job is no longer current", async () => {
          const outcome = await engine.runJob({ command: "sync", configPath });
          expect(outcome.report.result).toEqual("ok");
          expect(outcome.output.exitCode).toEqual(0);
          expect(engine.currentJob()).toEqual(null);
          expect(engine.lastJob()?.command).toEqual("sync");
        });

        await step("the status describes the data disks", async () => {
          const { status } = await engine.readStatus(configPath);
          expect(status.disks?.map((disk) => disk.name).sort()).toEqual([...dataDisks].sort());
          expect(status.diskIssues).toEqual([]);
          expect(!status.hasErrors).toBeTruthy();
        });

        await step("the diff lists a new file, a sync records it", async () => {
          await addFile("new-file.bin");
          const before = await engine.readDiff(configPath);
          expect(before.newFiles).toEqual(1);
          expect(before.files.some((file) => file.name.endsWith("new-file.bin"))).toBeTruthy();

          await engine.runJob({ command: "sync", configPath });
          expect((await engine.readDiff(configPath)).newFiles).toEqual(0);
        });

        await step("afterRun runs while the job is current, the status waits for it", async () => {
          let current = null as ReturnType<SnapRaidEngine["currentJob"]>;
          await engine.runJob({
            command: "scrub",
            configPath,
            args: ["-p", "new"],
            afterRun: async () => {
              current = engine.currentJob();
              const error = await assertRejects(() => engine.readStatus(configPath), EngineBusyError);
              expect(error.reason).toEqual("job");
            },
          });
          expect(current?.command).toEqual("scrub");
        });

        await step("output goes to onOutput", async () => {
          const chunks: string[] = [];
          await engine.runJob({ command: "diff", configPath, onOutput: (chunk) => chunks.push(chunk) });
          expect(chunks.join("").length > 0).toBeTruthy();
        });

        await step("abort without a running job does nothing", () => {
          expect(engine.abortJob("nothing-1")).toEqual(false);
        });
      } finally {
        await cleanup?.();
      }
    },
    // The CLI engine runs SnapRAID, a daemon its tasks: more than a unit test's 5 s
    60_000,
  );
