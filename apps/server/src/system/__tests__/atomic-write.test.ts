import { expect, test } from "bun:test";
import { assertRejects } from "../../__tests__/assert-error.ts";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { writeTextFileAtomic } from "../atomic-write.ts";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const withDir = async (run: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true });
  }
};

const schedules = (count: number) =>
  JSON.stringify({ schedules: Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Nightly sync ${i}` })) }, null, 2);

// The e2e run saw GET /api/schedules answer 500 while a schedule's outcome was saved: the file was
// read between writeFile's truncate and its write
test("writeTextFileAtomic - a reader at the same time never gets a half-written file", async () => {
  await withDir(async (dir) => {
    const path = join(dir, "schedules.json");
    await writeTextFileAtomic(path, schedules(50));
    let done = false;
    let unreadable = 0;
    const writer = (async () => {
      for (let i = 0; i < 300; i++) await writeTextFileAtomic(path, schedules(50 + (i % 2)));
      done = true;
    })();
    while (!done) {
      try {
        JSON.parse(await readFile(path, "utf8"));
      } catch {
        unreadable++;
      }
    }
    await writer;
    expect(unreadable).toEqual(0);
  });
});

test("writeTextFileAtomic - replaces the content, with the mode, and leaves no temporary file", async () => {
  await withDir(async (dir) => {
    const path = join(dir, "engine.json");
    await writeFile(path, "old");
    await writeTextFileAtomic(path, "new", { mode: 0o600 });
    expect(await readFile(path, "utf8")).toEqual("new");
    expect((await stat(path)).mode! & 0o777).toEqual(0o600);
    expect(readdirSync(dir)).toEqual(["engine.json"]);
  });
});

test("writeTextFileAtomic - a failed write removes its temporary file", async () => {
  await withDir(async (dir) => {
    // A directory in the way: the temporary file is written, the rename fails
    await mkdir(join(dir, "config.json"));
    await writeFile(join(dir, "config.json", "keep"), "");
    await assertRejects(() => writeTextFileAtomic(join(dir, "config.json"), "{}"));
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });
});
