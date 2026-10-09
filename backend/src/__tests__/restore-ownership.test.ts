import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { adoptFolderOwnership, fileMode, folderMode, recreatedFiles } from "../restore-ownership.ts";

// From a real `snapraid fix`: a/two was changed (fixed in place), a/one and a/we:ird were deleted
const FIX_LOG = [
  "msg:progress: Fixing...",
  "msg:error: File '/mnt/d1/a/two' is larger than expected.",
  "error:0:d1:a/two: Size error",
  "fixed:0:d1:a/two: Fixed size",
  "msg:error: Missing file '/mnt/d1/a/we:ird'.",
  "error:1:d1:a/we\\dird: Read error at position 0. No such file or directory.",
  "repair_entry:0:block:known:bad:d1:a/we\\dird:0:",
  "fixed:1:d1:a/we\\dird: Fixed data error at position 0",
  "status:recovered:d1:a/we\\dird",
  "error:2:d2:b/one: Read error at position 0. No such file or directory.",
  "fixed:2:d2:b/one: Fixed data error at position 0",
  "status:recovered:d2:b/one",
  "error:3:d2:b/lost: Read error at position 0. No such file or directory.",
  "status:unrecoverable:d2:b/lost",
  "summary:exit:recovered",
].join("\n");

Deno.test("recreatedFiles - missing and recovered, not changed or unrecoverable ones", () => {
  assertEquals(recreatedFiles(FIX_LOG), [
    { disk: "d1", path: "a/we:ird" },
    { disk: "d2", path: "b/one" },
  ]);
  assertEquals(recreatedFiles(""), []);
});

Deno.test("fileMode and folderMode - from the folder they are restored into", () => {
  assertEquals(fileMode(0o755), 0o644);
  assertEquals(fileMode(0o775), 0o664);
  assertEquals(fileMode(0o750), 0o640);
  assertEquals(fileMode(0o2775), 0o664);
  assertEquals(folderMode(0o2775), 0o2775);
  assertEquals(folderMode(0o750), 0o750);
});

const modeOf = async (path: string) => (await Deno.stat(path)).mode! & 0o7777;

// Without root no other owner can be set; the folder logic shows in the permissions
Deno.test("adoptFolderOwnership - files and the folders made for them take the closest older folder's permissions", async () => {
  const base = await Deno.makeTempDir();
  const d1 = join(base, "d1");
  const d2 = join(base, "d2");
  try {
    await Deno.mkdir(join(d1, "photos"), { recursive: true });
    await Deno.chmod(join(d1, "photos"), 0o750);
    await Deno.mkdir(join(d2, "movies", "2024"), { recursive: true });
    await Deno.chmod(join(d2, "movies"), 0o770);
    await Deno.chmod(join(d2, "movies", "2024"), 0o775);
    await Deno.chmod(d1, 0o755);
    // Folder times may only have seconds
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const startedAt = new Date();

    // As fix leaves them: mode 600, folders it had to make
    await Deno.writeTextFile(join(d1, "photos", "a.jpg"), "a", { mode: 0o600 });
    await Deno.mkdir(join(d1, "photos", "2023", "summer"), { recursive: true });
    await Deno.writeTextFile(join(d1, "photos", "2023", "summer", "b.jpg"), "b", { mode: 0o600 });
    // A folder only another disk still has: a new disk after a replacement
    await Deno.mkdir(join(d1, "movies", "2024"), { recursive: true });
    await Deno.writeTextFile(join(d1, "movies", "2024", "c.mkv"), "c", { mode: 0o600 });
    await Deno.chmod(join(d1, "photos", "a.jpg"), 0o600);
    await Deno.chmod(join(d1, "photos", "2023", "summer", "b.jpg"), 0o600);
    await Deno.chmod(join(d1, "movies", "2024", "c.mkv"), 0o600);

    const result = await adoptFolderOwnership(
      [
        { disk: "d1", path: "photos/a.jpg" },
        { disk: "d1", path: "photos/2023/summer/b.jpg" },
        { disk: "d1", path: "movies/2024/c.mkv" },
        { disk: "d1", path: "photos/gone.jpg" },
      ],
      { dataDisks: { d1: `${d1}/`, d2 }, startedAt },
    );

    assertEquals(await modeOf(join(d1, "photos", "a.jpg")), 0o640);
    assertEquals(await modeOf(join(d1, "photos", "2023")), 0o750);
    assertEquals(await modeOf(join(d1, "photos", "2023", "summer")), 0o750);
    assertEquals(await modeOf(join(d1, "photos", "2023", "summer", "b.jpg")), 0o640);
    // The folder that existed before is left alone
    assertEquals(await modeOf(join(d1, "photos")), 0o750);
    // Taken from d2/movies/2024
    assertEquals(await modeOf(join(d1, "movies", "2024", "c.mkv")), 0o664);
    assertEquals(await modeOf(join(d1, "movies", "2024")), 0o775);
    assertEquals(result, { files: 3, folders: 4, failed: 0 });
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test({
  name: "adoptFolderOwnership - owner and group of the folder (as root)",
  // Only root can give a file to someone else
  ignore: Deno.uid() !== 0,
  fn: async () => {
    const base = await Deno.makeTempDir();
    try {
      await Deno.mkdir(join(base, "home"));
      await Deno.chown(join(base, "home"), 1234, 2345);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const startedAt = new Date();
      await Deno.mkdir(join(base, "home", "new"));
      await Deno.writeTextFile(join(base, "home", "new", "x.txt"), "x");

      await adoptFolderOwnership([{ disk: "d1", path: "home/new/x.txt" }], { dataDisks: { d1: base }, startedAt });

      for (const path of ["home/new", "home/new/x.txt"]) {
        const { uid, gid } = await Deno.stat(join(base, path));
        assertEquals({ uid, gid }, { uid: 1234, gid: 2345 });
      }
    } finally {
      await Deno.remove(base, { recursive: true });
    }
  },
});
