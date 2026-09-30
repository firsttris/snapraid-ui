import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createLogManager, parseRunResult } from "../log-manager.ts";

const syncLog = (config: string, exit?: string) =>
  [`conf:file:${config}`, "command:sync", ...(exit ? [`summary:exit:${exit}`] : [])].join("\n");

Deno.test("findLastRun - skips the log of a job that is still running", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(dir, "sync-20260930-010000.log"), syncLog("/cfg/a.conf", "ok"));
    // The running sync has no summary yet
    await Deno.writeTextFile(join(dir, "sync-20260930-020000.log"), syncLog("/cfg/a.conf"));
    const logs = createLogManager(dir);

    assertEquals((await logs.findLastRun("sync", "/cfg/a.conf"))?.result, "incomplete");

    const previous = await logs.findLastRun("sync", "/cfg/a.conf", "sync-20260930-020000.log");
    assertEquals([previous?.result, previous?.logFile], ["ok", "sync-20260930-010000.log"]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("listLogs - reports result and config of each log", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const running = join(dir, "sync-20260930-020000.log");
    await Deno.writeTextFile(join(dir, "sync-20260930-010000.log"), syncLog("/cfg/a.conf", "ok"));
    await Deno.writeTextFile(running, syncLog("/cfg/b.conf"));
    const logs = createLogManager(dir);

    const listed = await logs.listLogs();
    assertEquals(
      listed.map((log) => [log.filename, log.result, log.configPath]),
      [
        ["sync-20260930-020000.log", "incomplete", "/cfg/b.conf"],
        ["sync-20260930-010000.log", "ok", "/cfg/a.conf"],
      ],
    );

    // A log that grew since the last listing is read again
    await Deno.writeTextFile(running, syncLog("/cfg/b.conf", "error"));
    assertEquals((await logs.listLogs())[0].result, "error");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("parseRunResult - diff and dup that found something succeeded", () => {
  assertEquals(parseRunResult("summary:exit:diff"), "ok");
  assertEquals(parseRunResult("summary:exit:dup"), "ok");
  assertEquals(parseRunResult("summary:exit:bad"), "error");
});
