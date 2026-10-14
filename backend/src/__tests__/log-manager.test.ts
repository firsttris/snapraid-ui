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


const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(`../parsers/__tests__/fixtures/${name}`, import.meta.url));

// The touch log of issue #48 ends with the saved content file, the smart log with the array failure probability
const TOUCH_LOG = fixture("touch.log");
const SMART_LOG = fixture("smart.log");

Deno.test("listLogs - finished touch and smart runs are not incomplete", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(dir, "touch-20261013-173720.log"), TOUCH_LOG);
    await Deno.writeTextFile(join(dir, "smart-20261013-173000.log"), SMART_LOG);
    const logs = createLogManager(dir);

    assertEquals(
      (await logs.listLogs()).map((log) => [log.command, log.result]),
      [["touch", "ok"], ["smart", "ok"]],
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("listLogs - a touch or smart log cut short stays incomplete until it finishes", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const touch = join(dir, "touch-20261013-173720.log");
    const smart = join(dir, "smart-20261013-173000.log");
    // Written up to the line before the one that marks the end
    await Deno.writeTextFile(touch, TOUCH_LOG.slice(0, TOUCH_LOG.indexOf("content_info:write_unixtime:")));
    await Deno.writeTextFile(smart, SMART_LOG.slice(0, SMART_LOG.indexOf("summary:array_failure:")));
    const logs = createLogManager(dir);

    assertEquals((await logs.listLogs()).map((log) => log.result), ["incomplete", "incomplete"]);

    // The cached result is replaced once the run writes its last lines
    await Deno.writeTextFile(touch, TOUCH_LOG);
    await Deno.writeTextFile(smart, SMART_LOG);
    assertEquals((await logs.listLogs()).map((log) => log.result), ["ok", "ok"]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("findLastRun - a finished touch counts as ok", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(dir, "touch-20261013-173720.log"), TOUCH_LOG);
    const logs = createLogManager(dir);

    const last = await logs.findLastRun("touch", "/app/snapraid/snapraid.conf");
    assertEquals(
      [last?.result, last?.logFile, last?.timestamp, last?.forceOption],
      ["ok", "touch-20261013-173720.log", "2026-10-13T17:37:20.000Z", undefined],
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
