import { expect, test } from "bun:test";
import { join } from "node:path";
import { adoptFolderOwnership, fileMode, folderMode, recreatedFiles } from "../restore-ownership.ts";
import { chmod, chown, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { writeTextFile } from "../../system/fs.ts";

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

test("recreatedFiles - missing and recovered, not changed or unrecoverable ones", () => {
  expect(recreatedFiles(FIX_LOG)).toEqual([
    { disk: "d1", path: "a/we:ird" },
    { disk: "d2", path: "b/one" },
  ]);
  expect(recreatedFiles("")).toEqual([]);
});

test("fileMode and folderMode - from the folder they are restored into", () => {
  expect(fileMode(0o755)).toEqual(0o644);
  expect(fileMode(0o775)).toEqual(0o664);
  expect(fileMode(0o750)).toEqual(0o640);
  expect(fileMode(0o2775)).toEqual(0o664);
  expect(folderMode(0o2775)).toEqual(0o2775);
  expect(folderMode(0o750)).toEqual(0o750);
});

const modeOf = async (path: string) => (await stat(path)).mode! & 0o7777;

// Without root no other owner can be set; the folder logic shows in the permissions
test("adoptFolderOwnership - files and the folders made for them take the closest older folder's permissions", async () => {
  const base = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  const d1 = join(base, "d1");
  const d2 = join(base, "d2");
  try {
    await mkdir(join(d1, "photos"), { recursive: true });
    await chmod(join(d1, "photos"), 0o750);
    await mkdir(join(d2, "movies", "2024"), { recursive: true });
    await chmod(join(d2, "movies"), 0o770);
    await chmod(join(d2, "movies", "2024"), 0o775);
    await chmod(d1, 0o755);
    // Folder times may only have seconds
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const startedAt = new Date();

    // As fix leaves them: mode 600, folders it had to make
    await writeTextFile(join(d1, "photos", "a.jpg"), "a", { mode: 0o600 });
    await mkdir(join(d1, "photos", "2023", "summer"), { recursive: true });
    await writeTextFile(join(d1, "photos", "2023", "summer", "b.jpg"), "b", { mode: 0o600 });
    // A folder only another disk still has: a new disk after a replacement
    await mkdir(join(d1, "movies", "2024"), { recursive: true });
    await writeTextFile(join(d1, "movies", "2024", "c.mkv"), "c", { mode: 0o600 });
    await chmod(join(d1, "photos", "a.jpg"), 0o600);
    await chmod(join(d1, "photos", "2023", "summer", "b.jpg"), 0o600);
    await chmod(join(d1, "movies", "2024", "c.mkv"), 0o600);

    const result = await adoptFolderOwnership(
      [
        { disk: "d1", path: "photos/a.jpg" },
        { disk: "d1", path: "photos/2023/summer/b.jpg" },
        { disk: "d1", path: "movies/2024/c.mkv" },
        { disk: "d1", path: "photos/gone.jpg" },
      ],
      { dataDisks: { d1: `${d1}/`, d2 }, startedAt },
    );

    expect(await modeOf(join(d1, "photos", "a.jpg"))).toEqual(0o640);
    expect(await modeOf(join(d1, "photos", "2023"))).toEqual(0o750);
    expect(await modeOf(join(d1, "photos", "2023", "summer"))).toEqual(0o750);
    expect(await modeOf(join(d1, "photos", "2023", "summer", "b.jpg"))).toEqual(0o640);
    // The folder that existed before is left alone
    expect(await modeOf(join(d1, "photos"))).toEqual(0o750);
    // Taken from d2/movies/2024
    expect(await modeOf(join(d1, "movies", "2024", "c.mkv"))).toEqual(0o664);
    expect(await modeOf(join(d1, "movies", "2024"))).toEqual(0o775);
    expect(result).toEqual({ files: 3, folders: 4, failed: 0 });
  } finally {
    await rm(base, { recursive: true });
  }
});

// Only root can give a file to someone else
test.skipIf(process.getuid?.() !== 0)("adoptFolderOwnership - owner and group of the folder (as root)", async () => {
  const base = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await mkdir(join(base, "home"));
    await chown(join(base, "home"), 1234, 2345);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const startedAt = new Date();
    await mkdir(join(base, "home", "new"));
    await writeFile(join(base, "home", "new", "x.txt"), "x");

    await adoptFolderOwnership([{ disk: "d1", path: "home/new/x.txt" }], { dataDisks: { d1: base }, startedAt });

    for (const path of ["home/new", "home/new/x.txt"]) {
      const { uid, gid } = await stat(join(base, path));
      expect({ uid, gid }).toEqual({ uid: 1234, gid: 2345 });
    }
  } finally {
    await rm(base, { recursive: true });
  }
});
