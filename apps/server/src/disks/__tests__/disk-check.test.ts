import { expect, test } from "bun:test";
import { blockingIssues, findDiskIssues, inspectPath, type PathState, parseRecordedDisks } from "../disk-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Structured log of `status`, trimmed to the tags the check reads
const LOG = [
  "conf:file:/etc/snapraid.conf",
  "data:d1:/mnt/disk1/:aaaa-1111",
  "data:d2:/mnt/disk2/:bbbb-new",
  "data:d3:/mnt/disk3/:root-fs",
  "data:d4:/mnt/new\\ddisk/:",
  "mode:par2",
  "parity:/mnt/parity1/snapraid.parity:pppp-1111",
  "2-parity:/mnt/parity2/snapraid.2-parity:",
  "content_data:d1:4000:1000",
  "content_data_split:d1:aaaa-1111",
  "content_data_split:d2:bbbb-old",
  "content_data_split:d3:cccc-3333",
  "content_parity_split:parity:pppp-1111:/mnt/parity1/snapraid.parity:8847360",
  "content_parity_split:2-parity:qqqq-2222:/mnt/parity2/snapraid.2-parity:8847360",
  "summary:disk_file_count:d1:5",
  "summary:disk_file_count:d2:4",
  "summary:disk_file_count:d3:2",
  "summary:disk_file_count:d4:0",
].join("\n");

const fakeFs = (states: Record<string, PathState>) => (path: string) => Promise.resolve(states[path] ?? "present");

test("parseRecordedDisks - configured path and filesystem next to the recorded ones", () => {
  const disks = parseRecordedDisks(LOG);
  expect(disks.find((disk) => disk.name === "d2")).toEqual({
    name: "d2",
    type: "data",
    path: "/mnt/disk2/",
    uuid: "bbbb-new",
    storedUuid: "bbbb-old",
    files: 4,
    storedSize: 0,
  });
  expect(disks.find((disk) => disk.name === "d4")?.path).toEqual("/mnt/new:disk/");
  expect(disks.find((disk) => disk.name === "2-parity")?.storedSize).toEqual(8847360);
});

test("findDiskIssues - empty mount point, missing parity and a changed filesystem", async () => {
  const issues = await findDiskIssues(
    LOG,
    fakeFs({ "/mnt/disk3/": "empty", "/mnt/parity2/snapraid.2-parity": "missing" }),
  );
  expect(issues).toEqual([
    { disk: "d2", type: "data", path: "/mnt/disk2/", kind: "uuid_changed" },
    { disk: "d3", type: "data", path: "/mnt/disk3/", kind: "empty", files: 2 },
    { disk: "2-parity", type: "parity", path: "/mnt/parity2/snapraid.2-parity", kind: "missing" },
  ]);
  expect(blockingIssues(issues).map((issue) => issue.disk)).toEqual(["d3", "2-parity"]);
});

test("findDiskIssues - a disk without recorded files may be empty or missing", async () => {
  const issues = await findDiskIssues(
    "data:d4:/mnt/disk4/:\nsummary:disk_file_count:d4:0",
    fakeFs({ "/mnt/disk4/": "missing" }),
  );
  expect(issues).toEqual([]);
});

test("findDiskIssues - unknown filesystems are not compared", async () => {
  const issues = await findDiskIssues("data:d1:/mnt/disk1/:\ncontent_data_split:d1:aaaa\nsummary:disk_file_count:d1:3");
  expect(issues.filter((issue) => issue.kind === "uuid_changed")).toEqual([]);
});

test("inspectPath - missing, empty and lost+found only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    expect(await inspectPath(`${dir}/nope`)).toEqual("missing");
    expect(await inspectPath(dir)).toEqual("empty");
    await mkdir(`${dir}/lost+found`);
    expect(await inspectPath(dir)).toEqual("empty");
    await writeFile(`${dir}/file`, "x");
    expect(await inspectPath(dir)).toEqual("present");
    expect(await inspectPath(`${dir}/file`)).toEqual("present");
  } finally {
    await rm(dir, { recursive: true });
  }
});
