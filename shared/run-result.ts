import type { RunResult } from "./types.ts";

// touch and smart write no `summary:exit`, these tags show they ran to the end
const FINISHED_WITHOUT_SUMMARY: Record<string, RegExp> = {
  touch: /^content_info:write_unixtime:/m, // The touched timestamps were saved to the content file
  smart: /^summary:array_failure:/m,       // The failure probability of the whole array, printed last
};

/**
 * Derive the outcome of a run from its structured log
 */
export const parseRunResult = (log: string): RunResult => {
  if (/^sigint:/m.test(log)) return "aborted";
  const exit = log.match(/^summary:exit:(\w+)/m)?.[1];
  if (!exit) {
    // SnapRAID bails out on fatal errors before writing the summary
    if (/^msg:fatal:/m.test(log)) return "error";
    const finished = FINISHED_WITHOUT_SUMMARY[log.match(/^command:(\w+)/m)?.[1] ?? ""];
    return finished?.test(log) ? "ok" : "incomplete";
  }
  if (exit === "ok" || exit === "warning") return exit;
  // diff and dup report what they found, finding something is no failure
  if (["equal", "diff", "nodup", "dup"].includes(exit)) return "ok";
  // fix and check report what happened to the errors they found
  if (exit === "recovered") return "ok";
  if (exit === "recoverable") return "warning";
  return "error";
};
