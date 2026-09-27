import { join } from "@std/path";

export const BASE_PATH = Deno.env.get("SNAPRAID_BASE_PATH") || join(Deno.cwd(), "..", "snapraid");

// Binary to invoke, e.g. a locally built one for development
export const SNAPRAID_BIN = Deno.env.get("SNAPRAID_BIN") || "snapraid";

// Extra args prepended to every invocation, e.g. "--test-skip-device" for sandboxes on a single device
export const SNAPRAID_EXTRA_ARGS = (Deno.env.get("SNAPRAID_EXTRA_ARGS") ?? "").split(/\s+/).filter(Boolean);

export const snapraidCommand = (args: string[]): Deno.Command =>
  new Deno.Command(SNAPRAID_BIN, {
    args: [...SNAPRAID_EXTRA_ARGS, ...args],
    stdout: "piped",
    stderr: "piped",
  });
