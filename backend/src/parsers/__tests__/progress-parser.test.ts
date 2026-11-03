import { expect, test } from "bun:test";
import { parseRunPos } from "../progress-parser.ts";
import { createLogTail } from "../../executors/log-tail.ts";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("parseRunPos - reads the latest run:pos tag", () => {
  const log = [
    "run:begin:0:1000:1000",
    "run:pos:10:10:5000000:1::::2::",
    "run:pos:120:120:480000000:12:3900:150:12:40:41:45",
    "msg:progress: something else",
  ].join("\n");

  expect(parseRunPos(log)).toEqual({
    percent: 12,
    processedMB: 480,
    speedMBs: 150,
    etaMinutes: 65,
    temperature: 41,
  });
});

test("parseRunPos - leaves the estimates out until SnapRAID has them", () => {
  expect(parseRunPos("run:pos:0:0:0:0::::0::\n")).toEqual({
    percent: 0,
    processedMB: 0,
    speedMBs: undefined,
    etaMinutes: undefined,
    temperature: undefined,
  });
  expect(parseRunPos("run:begin:0:10:10\nrun:end\n")).toEqual(null);
});

test("createLogTail - returns only new complete lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  const path = join(dir, "progress.log");
  await writeFile(path, "");
  try {
    const readNew = createLogTail(path);
    await writeFile(path, "run:begin:0:10:10\nrun:pos:1:1:0:1");
    expect(await readNew()).toEqual("run:begin:0:10:10\n");
    await appendFile(path, "0::::0::\nrun:end\n");
    expect(await readNew()).toEqual("run:pos:1:1:0:10::::0::\nrun:end\n");
    expect(await readNew()).toEqual("");
  } finally {
    await rm(dir, { recursive: true });
  }
});
