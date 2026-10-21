import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { writeTextFileAtomic } from "../atomic-write.ts";

const withDir = async (run: (dir: string) => Promise<void>) => {
  const dir = await Deno.makeTempDir();
  try {
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const schedules = (count: number) =>
  JSON.stringify({ schedules: Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Nightly sync ${i}` })) }, null, 2);

// The e2e run saw GET /api/schedules answer 500 while a schedule's outcome was saved: the file was
// read between Deno.writeTextFile's truncate and its write
Deno.test("writeTextFileAtomic - a reader at the same time never gets a half-written file", async () => {
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
        JSON.parse(await Deno.readTextFile(path));
      } catch {
        unreadable++;
      }
    }
    await writer;
    assertEquals(unreadable, 0);
  });
});

Deno.test("writeTextFileAtomic - replaces the content, with the mode, and leaves no temporary file", async () => {
  await withDir(async (dir) => {
    const path = join(dir, "engine.json");
    await Deno.writeTextFile(path, "old");
    await writeTextFileAtomic(path, "new", { mode: 0o600 });
    assertEquals(await Deno.readTextFile(path), "new");
    assertEquals((await Deno.stat(path)).mode! & 0o777, 0o600);
    assertEquals([...Deno.readDirSync(dir)].map((entry) => entry.name), ["engine.json"]);
  });
});

Deno.test("writeTextFileAtomic - a failed write removes its temporary file", async () => {
  await withDir(async (dir) => {
    // A directory in the way: the temporary file is written, the rename fails
    await Deno.mkdir(join(dir, "config.json"));
    await Deno.writeTextFile(join(dir, "config.json", "keep"), "");
    await assertRejects(() => writeTextFileAtomic(join(dir, "config.json"), "{}"));
    assertEquals([...Deno.readDirSync(dir)].map((entry) => entry.name), ["config.json"]);
  });
});
