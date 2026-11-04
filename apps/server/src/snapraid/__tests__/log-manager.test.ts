import { expect, test } from "bun:test";
import { join } from "node:path";
import { createLogManager, parseRunResult } from "../log-manager.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const syncLog = (config: string, exit?: string) =>
  [`conf:file:${config}`, "command:sync", ...(exit ? [`summary:exit:${exit}`] : [])].join("\n");

test("findLastRun - skips the log of a job that is still running", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await writeFile(join(dir, "sync-20260930-010000.log"), syncLog("/cfg/a.conf", "ok"));
    // The running sync has no summary yet
    await writeFile(join(dir, "sync-20260930-020000.log"), syncLog("/cfg/a.conf"));
    const logs = createLogManager(dir);

    expect((await logs.findLastRun("sync", "/cfg/a.conf"))?.result).toEqual("incomplete");

    const previous = await logs.findLastRun("sync", "/cfg/a.conf", "sync-20260930-020000.log");
    expect([previous?.result, previous?.logFile]).toEqual(["ok", "sync-20260930-010000.log"]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("listLogs - reports result and config of each log", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const running = join(dir, "sync-20260930-020000.log");
    await writeFile(join(dir, "sync-20260930-010000.log"), syncLog("/cfg/a.conf", "ok"));
    await writeFile(running, syncLog("/cfg/b.conf"));
    const logs = createLogManager(dir);

    const listed = await logs.listLogs();
    expect(listed.map((log) => [log.filename, log.result, log.configPath])).toEqual([
        ["sync-20260930-020000.log", "incomplete", "/cfg/b.conf"],
        ["sync-20260930-010000.log", "ok", "/cfg/a.conf"],
      ]);

    // A log that grew since the last listing is read again
    await writeFile(running, syncLog("/cfg/b.conf", "error"));
    expect((await logs.listLogs())[0].result).toEqual("error");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("parseRunResult - diff and dup that found something succeeded", () => {
  expect(parseRunResult("summary:exit:diff")).toEqual("ok");
  expect(parseRunResult("summary:exit:dup")).toEqual("ok");
  expect(parseRunResult("summary:exit:bad")).toEqual("error");
});


const fixture = (name: string) =>
  readFileSync(new URL(`../../parsers/__tests__/fixtures/${name}`, import.meta.url), "utf8");

// The touch log of issue #48 ends with the saved content file, the smart log with the array failure probability
const TOUCH_LOG = fixture("touch.log");
const SMART_LOG = fixture("smart.log");

test("listLogs - finished touch and smart runs are not incomplete", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await writeFile(join(dir, "touch-20261013-173720.log"), TOUCH_LOG);
    await writeFile(join(dir, "smart-20261013-173000.log"), SMART_LOG);
    const logs = createLogManager(dir);

    expect((await logs.listLogs()).map((log) => [log.command, log.result])).toEqual([["touch", "ok"], ["smart", "ok"]]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("listLogs - a touch or smart log cut short stays incomplete until it finishes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    const touch = join(dir, "touch-20261013-173720.log");
    const smart = join(dir, "smart-20261013-173000.log");
    // Written up to the line before the one that marks the end
    await writeFile(touch, TOUCH_LOG.slice(0, TOUCH_LOG.indexOf("content_info:write_unixtime:")));
    await writeFile(smart, SMART_LOG.slice(0, SMART_LOG.indexOf("summary:array_failure:")));
    const logs = createLogManager(dir);

    expect((await logs.listLogs()).map((log) => log.result)).toEqual(["incomplete", "incomplete"]);

    // The cached result is replaced once the run writes its last lines
    await writeFile(touch, TOUCH_LOG);
    await writeFile(smart, SMART_LOG);
    expect((await logs.listLogs()).map((log) => log.result)).toEqual(["ok", "ok"]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("findLastRun - a finished touch counts as ok", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await writeFile(join(dir, "touch-20261013-173720.log"), TOUCH_LOG);
    const logs = createLogManager(dir);

    const last = await logs.findLastRun("touch", "/app/snapraid/snapraid.conf");
    expect([last?.result, last?.logFile, last?.timestamp, last?.forceOption]).toEqual(["ok", "touch-20261013-173720.log", "2026-10-13T17:37:20.000Z", undefined]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
