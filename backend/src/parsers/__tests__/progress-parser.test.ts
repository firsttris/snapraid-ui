import { assertEquals } from "@std/assert";
import { parseRunPos } from "../progress-parser.ts";
import { createLogTail } from "../../executors/log-tail.ts";

Deno.test("parseRunPos - reads the latest run:pos tag", () => {
  const log = [
    "run:begin:0:1000:1000",
    "run:pos:10:10:5000000:1::::2::",
    "run:pos:120:120:480000000:12:3900:150:12:40:41:45",
    "msg:progress: something else",
  ].join("\n");

  assertEquals(parseRunPos(log), {
    percent: 12,
    processedMB: 480,
    speedMBs: 150,
    etaMinutes: 65,
    temperature: 41,
  });
});

Deno.test("parseRunPos - leaves the estimates out until SnapRAID has them", () => {
  assertEquals(parseRunPos("run:pos:0:0:0:0::::0::\n"), {
    percent: 0,
    processedMB: 0,
    speedMBs: undefined,
    etaMinutes: undefined,
    temperature: undefined,
  });
  assertEquals(parseRunPos("run:begin:0:10:10\nrun:end\n"), null);
});

Deno.test("createLogTail - returns only new complete lines", async () => {
  const path = await Deno.makeTempFile();
  try {
    const readNew = createLogTail(path);
    await Deno.writeTextFile(path, "run:begin:0:10:10\nrun:pos:1:1:0:1");
    assertEquals(await readNew(), "run:begin:0:10:10\n");
    await Deno.writeTextFile(path, "0::::0::\nrun:end\n", { append: true });
    assertEquals(await readNew(), "run:pos:1:1:0:10::::0::\nrun:end\n");
    assertEquals(await readNew(), "");
  } finally {
    await Deno.remove(path);
  }
});
