import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import type { DiffReport } from "@shared/types.ts";
import { changedPaths, deleteDuplicates, insideDisk, markGone } from "../duplicates.ts";

const diff = (files: DiffReport["files"]): DiffReport => ({
  files,
  totalFiles: 0,
  equalFiles: 0,
  newFiles: 0,
  modifiedFiles: 0,
  deletedFiles: 0,
  movedFiles: 0,
  copiedFiles: 0,
  restoredFiles: 0,
  timestamp: "",
  rawOutput: "",
});

Deno.test("changedPaths - every path the diff reports, both sides of a move", () => {
  assertEquals(
    changedPaths(diff([
      { status: "updated", disk: "d1", name: "a/changed.mkv" },
      { status: "moved", disk: "d2", name: "old/b.mkv -> new/b.mkv" },
      { status: "added", disk: "d1", name: "/c.txt" },
    ])),
    new Set(["a/changed.mkv", "old/b.mkv", "new/b.mkv", "c.txt"]),
  );
});

Deno.test("insideDisk - paths stay on their disk", () => {
  assertEquals(insideDisk("/mnt/d1/", "movies/a.mkv"), "/mnt/d1/movies/a.mkv");
  assertEquals(insideDisk("/mnt/d1", "/movies/a.mkv"), "/mnt/d1/movies/a.mkv");
  assertEquals(insideDisk("/mnt/d1", "../d2/a.mkv"), null);
  assertEquals(insideDisk("/mnt/d1", "movies/../../etc/passwd"), null);
  assertEquals(insideDisk("/mnt/d1", ""), null);
});

Deno.test("deleteDuplicates - deletes safe copies, skips the rest with a reason", async () => {
  const base = await Deno.makeTempDir();
  const d1 = join(base, "d1");
  const d2 = join(base, "d2");
  try {
    await Deno.mkdir(join(d1, "movies"), { recursive: true });
    await Deno.mkdir(join(d2, "backup"), { recursive: true });
    const write = (path: string, text: string) => Deno.writeTextFile(path, text);
    await write(join(d1, "movies", "a.mkv"), "aaaa");
    await write(join(d2, "backup", "a.mkv"), "aaaa");
    await write(join(d1, "movies", "b.mkv"), "bbbb");
    await write(join(d2, "backup", "b.mkv"), "bbbbbb"); // Grew since the sync
    await write(join(d1, "movies", "c.mkv"), "cccc");
    await write(join(d2, "backup", "c.mkv"), "cccc");
    await write(join(d1, "movies", "e.mkv"), "eeee");
    await write(join(d2, "backup", "e.mkv"), "eeee");

    const keepA = { keepDisk: "d1", keepPath: "movies/a.mkv", size: 4 };
    const result = await deleteDuplicates(
      [
        { disk: "d2", path: "backup/a.mkv", ...keepA },
        { disk: "d2", path: "backup/b.mkv", keepDisk: "d1", keepPath: "movies/b.mkv", size: 4 },
        { disk: "d2", path: "backup/c.mkv", keepDisk: "d1", keepPath: "movies/c.mkv", size: 4 },
        { disk: "d2", path: "backup/gone.mkv", ...keepA },
        { disk: "d2", path: "../d1/movies/a.mkv", ...keepA },
        { disk: "d9", path: "x.mkv", ...keepA },
        // Each would delete the copy the other keeps: neither goes
        { disk: "d2", path: "backup/e.mkv", keepDisk: "d1", keepPath: "movies/e.mkv", size: 4 },
        { disk: "d1", path: "movies/e.mkv", keepDisk: "d2", keepPath: "backup/e.mkv", size: 4 },
      ],
      { dataDisks: { d1: `${d1}/`, d2 }, changed: new Set(["movies/c.mkv"]) },
    );

    assertEquals(result.deleted.map((file) => file.path), ["backup/a.mkv"]);
    assertEquals(result.skipped.map(({ path, reason }) => [path, reason]), [
      ["backup/b.mkv", "size_differs"],
      ["backup/c.mkv", "changed_since_sync"],
      ["backup/gone.mkv", "missing"],
      ["../d1/movies/a.mkv", "outside_disk"],
      ["x.mkv", "unknown_disk"],
      ["backup/e.mkv", "kept_copy_deleted"],
      ["movies/e.mkv", "kept_copy_deleted"],
    ]);
    // The copies that stay are all there
    for (const path of ["movies/a.mkv", "movies/b.mkv", "movies/c.mkv", "movies/e.mkv"]) {
      assertEquals((await Deno.stat(join(d1, path))).isFile, true);
    }
    assertEquals(await Deno.stat(join(d2, "backup", "a.mkv")).catch(() => null), null);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("markGone - copies no longer on their disk are marked, unknown disks stay", async () => {
  const d1 = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(d1, "a.mkv"), "aaaa");
    const dup = (name: string, originalName: string, disk = "d1") => ({
      disk,
      name,
      originalDisk: "d1",
      originalName,
      size: 4,
    });
    const result = await markGone(
      {
        duplicates: [dup("gone.mkv", "a.mkv"), dup("a.mkv", "deleted.mkv"), dup("x.mkv", "a.mkv", "d9")],
        totalDuplicates: 3,
        totalSize: 12,
        timestamp: "",
        rawOutput: "",
      },
      { d1 },
    );
    assertEquals(result.duplicates, [
      { ...dup("gone.mkv", "a.mkv"), gone: true },
      { ...dup("a.mkv", "deleted.mkv"), originalGone: true },
      dup("x.mkv", "a.mkv", "d9"),
    ]);
  } finally {
    await Deno.remove(d1, { recursive: true });
  }
});
