import { assertEquals } from "@std/assert";
import { parseRunResult } from "@shared/run-result.ts";

const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(`../parsers/__tests__/fixtures/${name}`, import.meta.url));

const lines = (...tags: string[]) => tags.join("\n");

// Everything up to (not including) the first line starting with `tag`
const cutBefore = (log: string, tag: string) => log.slice(0, log.indexOf(`\n${tag}`) + 1);

Deno.test("parseRunResult - every summary:exit value", () => {
  const cases: Array<[string, string]> = [
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
    assertEquals(parseRunResult(lines("command:sync", `summary:exit:${exit}`)), result, exit);
  }
});

Deno.test("parseRunResult - the real fixtures", () => {
  const cases: Array<[string, string]> = [
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
  for (const [name, result] of cases) assertEquals(parseRunResult(fixture(name)), result, name);
});

Deno.test("parseRunResult - a finished touch is ok although it writes no summary", () => {
  const touch = fixture("touch.log");
  assertEquals(parseRunResult(touch), "ok");
  // Windows line endings, e.g. a log copied off a share
  assertEquals(parseRunResult(touch.replaceAll("\n", "\r\n")), "ok");
});

Deno.test("parseRunResult - a touch that did not save the content file is incomplete", () => {
  const touch = fixture("touch.log");
  // Still touching, or killed before saving
  assertEquals(parseRunResult(cutBefore(touch, "msg:status:     1750 touched files")), "incomplete");
  assertEquals(parseRunResult(cutBefore(touch, "content_info:write_unixtime:")), "incomplete");
  // The timestamp read at start is no sign of the end
  assertEquals(parseRunResult(lines("command:touch", "content_info:read_unixtime:1791910373")), "incomplete");
});

Deno.test("parseRunResult - a finished smart is ok although it writes no summary:exit", () => {
  assertEquals(parseRunResult(fixture("smart.log")), "ok");
  // Nothing but the array line, e.g. no disk could be read
  assertEquals(parseRunResult(lines("command:smart", "summary:array_failure:0:0")), "ok");
});

Deno.test("parseRunResult - a smart without the array failure line is incomplete", () => {
  assertEquals(parseRunResult(cutBefore(fixture("smart.log"), "summary:array_failure:")), "incomplete");
  assertEquals(parseRunResult("command:smart"), "incomplete");
});

Deno.test("parseRunResult - fatal errors and Ctrl+C win over the end markers", () => {
  const touch = fixture("touch.log");
  const smart = fixture("smart.log");
  assertEquals(parseRunResult(`${touch}\nmsg:fatal: Error writing the content file`), "error");
  assertEquals(parseRunResult(`${smart}\nmsg:fatal: Failed to run smartctl`), "error");
  assertEquals(parseRunResult(`${touch}\nsigint:`), "aborted");
  assertEquals(parseRunResult(`${smart}\nsigint:`), "aborted");
  // Failing before the end marker
  assertEquals(parseRunResult(lines("command:touch", "msg:fatal: No content file found")), "error");
});

Deno.test("parseRunResult - end markers only count for the command they belong to", () => {
  // sync and scrub save the content file while they run (autosave), they are done only with a summary
  for (const command of ["sync", "scrub", "fix", "check"]) {
    assertEquals(
      parseRunResult(lines(`command:${command}`, "content_info:write_unixtime:1791913041")),
      "incomplete",
      command,
    );
  }
  assertEquals(parseRunResult(lines("command:touch", "summary:array_failure:0.5:0.4")), "incomplete");
  assertEquals(parseRunResult(lines("command:smart", "content_info:write_unixtime:1791913041")), "incomplete");
  // A log without its header can not be told apart from one that stopped early
  assertEquals(parseRunResult("content_info:write_unixtime:1791913041"), "incomplete");
  assertEquals(parseRunResult(""), "incomplete");
});
