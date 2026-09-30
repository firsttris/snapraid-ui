import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createLogManager } from "../log-manager.ts";

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
