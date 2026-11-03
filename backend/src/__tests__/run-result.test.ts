import { expect, test } from "bun:test";
import { parseRunResult } from "@shared/run-result.ts";
import type { RunResult } from "@shared/types.ts";
import { readFileSync } from "node:fs";

const fixture = (name: string) =>
  readFileSync(new URL(`../parsers/__tests__/fixtures/${name}`, import.meta.url), "utf8");

const lines = (...tags: string[]) => tags.join("\n");

// Everything up to (not including) the first line starting with `tag`
const cutBefore = (log: string, tag: string) => log.slice(0, log.indexOf(`\n${tag}`) + 1);

test("parseRunResult - every summary:exit value", () => {
  const cases: Array<[string, RunResult]> = [
    ["ok", "ok"],
    ["warning", "warning"],
    ["equal", "ok"],
    ["diff", "ok"],
    ["nodup", "ok"],
    ["dup", "ok"],
    ["recovered", "ok"],
    ["recoverable", "warning"],
    ["unrecoverable", "error"],
    ["error", "error"],
    ["bad", "error"],
  ];
  for (const [exit, result] of cases) {
    expect(parseRunResult(lines("command:sync", `summary:exit:${exit}`)), exit).toEqual(result);
  }
});

test("parseRunResult - the real fixtures", () => {
  const cases: Array<[string, RunResult]> = [
    ["check-ok.log", "ok"],
    ["check.log", "warning"],
    ["diff.log", "ok"],
    ["diff-remove.log", "ok"],
    ["dup.log", "ok"],
    ["list.log", "ok"],
    ["status.log", "ok"],
    ["status-bad.log", "error"],
    ["touch.log", "ok"],
    ["smart.log", "ok"],
  ];
  for (const [name, result] of cases) expect(parseRunResult(fixture(name)), name).toEqual(result);
});

test("parseRunResult - a finished touch is ok although it writes no summary", () => {
  const touch = fixture("touch.log");
  expect(parseRunResult(touch)).toEqual("ok");
  // Windows line endings, e.g. a log copied off a share
  expect(parseRunResult(touch.replaceAll("\n", "\r\n"))).toEqual("ok");
});

test("parseRunResult - a touch that did not save the content file is incomplete", () => {
  const touch = fixture("touch.log");
  // Still touching, or killed before saving
  expect(parseRunResult(cutBefore(touch, "msg:status:     1750 touched files"))).toEqual("incomplete");
  expect(parseRunResult(cutBefore(touch, "content_info:write_unixtime:"))).toEqual("incomplete");
  // The timestamp read at start is no sign of the end
  expect(parseRunResult(lines("command:touch", "content_info:read_unixtime:1791910373"))).toEqual("incomplete");
});

test("parseRunResult - a finished smart is ok although it writes no summary:exit", () => {
  expect(parseRunResult(fixture("smart.log"))).toEqual("ok");
  // Nothing but the array line, e.g. no disk could be read
  expect(parseRunResult(lines("command:smart", "summary:array_failure:0:0"))).toEqual("ok");
});

test("parseRunResult - a smart without the array failure line is incomplete", () => {
  expect(parseRunResult(cutBefore(fixture("smart.log"), "summary:array_failure:"))).toEqual("incomplete");
  expect(parseRunResult("command:smart")).toEqual("incomplete");
});

test("parseRunResult - fatal errors and Ctrl+C win over the end markers", () => {
  const touch = fixture("touch.log");
  const smart = fixture("smart.log");
  expect(parseRunResult(`${touch}\nmsg:fatal: Error writing the content file`)).toEqual("error");
  expect(parseRunResult(`${smart}\nmsg:fatal: Failed to run smartctl`)).toEqual("error");
  expect(parseRunResult(`${touch}\nsigint:`)).toEqual("aborted");
  expect(parseRunResult(`${smart}\nsigint:`)).toEqual("aborted");
  // Failing before the end marker
  expect(parseRunResult(lines("command:touch", "msg:fatal: No content file found"))).toEqual("error");
});

test("parseRunResult - end markers only count for the command they belong to", () => {
  // sync and scrub save the content file while they run (autosave), they are done only with a summary
  for (const command of ["sync", "scrub", "fix", "check"]) {
    expect(parseRunResult(lines(`command:${command}`, "content_info:write_unixtime:1791913041")), command).toEqual("incomplete");
  }
  expect(parseRunResult(lines("command:touch", "summary:array_failure:0.5:0.4"))).toEqual("incomplete");
  expect(parseRunResult(lines("command:smart", "content_info:write_unixtime:1791913041"))).toEqual("incomplete");
  // A log without its header can not be told apart from one that stopped early
  expect(parseRunResult("content_info:write_unixtime:1791913041")).toEqual("incomplete");
  expect(parseRunResult("")).toEqual("incomplete");
});
