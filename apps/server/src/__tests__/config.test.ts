import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_PATH, resolveFromBase, toStoredPath } from "../config.ts";

test("resolveFromBase - relative paths are resolved against BASE_PATH", () => {
  expect(resolveFromBase("snapraid.conf")).toEqual(join(BASE_PATH, "snapraid.conf"));
  expect(resolveFromBase("configs/media.conf")).toEqual(join(BASE_PATH, "configs", "media.conf"));
});

test("resolveFromBase - absolute paths are kept as is", () => {
  expect(resolveFromBase("/mnt/parity/snapraid-media.conf")).toEqual("/mnt/parity/snapraid-media.conf");
});

test("toStoredPath - files inside BASE_PATH are stored relative", () => {
  expect(toStoredPath(join(BASE_PATH, "snapraid.conf"))).toEqual("snapraid.conf");
  expect(toStoredPath(join(BASE_PATH, "configs", "media.conf"))).toEqual(join("configs", "media.conf"));
  expect(toStoredPath("snapraid.conf")).toEqual("snapraid.conf");
});

test("toStoredPath - files outside BASE_PATH are stored absolute", () => {
  expect(toStoredPath("/etc/snapraid.conf")).toEqual("/etc/snapraid.conf");
  expect(toStoredPath("../outside.conf")).toEqual(resolveFromBase("../outside.conf"));
});

// BASE_PATH is read once, when config.ts is imported: the first start runs in a process of its own
test("loadAppConfig - the first start creates the data directory and saves the default config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-ui-first-start-"));
  const base = join(dir, "snapraid");
  try {
    const proc = Bun.spawn(
      [process.execPath, "-e", `import { loadAppConfig } from ${JSON.stringify(join(import.meta.dir, "..", "config-parser.ts"))}; await loadAppConfig();`],
      { env: { ...process.env, SNAPRAID_BASE_PATH: base }, stdout: "pipe", stderr: "pipe" },
    );
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

    expect(stderr).not.toContain("Failed to save default config");
    expect(exitCode).toBe(0);
    // As the log directory and every other directory the backend makes: mkdir's default, less the umask
    expect((await stat(base)).mode & 0o777).toBe(0o777 & ~process.umask());
    const saved = JSON.parse(await readFile(join(base, "config.json"), "utf8"));
    expect(saved.snapraidConfigs[0].path).toBe("snapraid.conf");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
