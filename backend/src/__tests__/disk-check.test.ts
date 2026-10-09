import { assertEquals } from "@std/assert";
import { blockingIssues, findDiskIssues, inspectPath, type PathState, parseRecordedDisks } from "../disk-check.ts";

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

Deno.test("parseRecordedDisks - configured path and filesystem next to the recorded ones", () => {
  const disks = parseRecordedDisks(LOG);
  assertEquals(disks.find((disk) => disk.name === "d2"), {
    name: "d2",
    type: "data",
    path: "/mnt/disk2/",
    uuid: "bbbb-new",
    storedUuid: "bbbb-old",
    files: 4,
    storedSize: 0,
  });
  assertEquals(disks.find((disk) => disk.name === "d4")?.path, "/mnt/new:disk/");
  assertEquals(disks.find((disk) => disk.name === "2-parity")?.storedSize, 8847360);
});

Deno.test("findDiskIssues - empty mount point, missing parity and a changed filesystem", async () => {
  const issues = await findDiskIssues(
    LOG,
    fakeFs({ "/mnt/disk3/": "empty", "/mnt/parity2/snapraid.2-parity": "missing" }),
  );
  assertEquals(issues, [
    { disk: "d2", type: "data", path: "/mnt/disk2/", kind: "uuid_changed" },
    { disk: "d3", type: "data", path: "/mnt/disk3/", kind: "empty", files: 2 },
    { disk: "2-parity", type: "parity", path: "/mnt/parity2/snapraid.2-parity", kind: "missing" },
  ]);
  assertEquals(blockingIssues(issues).map((issue) => issue.disk), ["d3", "2-parity"]);
});

Deno.test("findDiskIssues - a disk without recorded files may be empty or missing", async () => {
  const issues = await findDiskIssues(
    "data:d4:/mnt/disk4/:\nsummary:disk_file_count:d4:0",
    fakeFs({ "/mnt/disk4/": "missing" }),
  );
  assertEquals(issues, []);
});

Deno.test("findDiskIssues - unknown filesystems are not compared", async () => {
  const issues = await findDiskIssues("data:d1:/mnt/disk1/:\ncontent_data_split:d1:aaaa\nsummary:disk_file_count:d1:3");
  assertEquals(issues.filter((issue) => issue.kind === "uuid_changed"), []);
});

Deno.test("inspectPath - missing, empty and lost+found only", async () => {
  const dir = await Deno.makeTempDir();
  try {
    assertEquals(await inspectPath(`${dir}/nope`), "missing");
    assertEquals(await inspectPath(dir), "empty");
    await Deno.mkdir(`${dir}/lost+found`);
    assertEquals(await inspectPath(dir), "empty");
    await Deno.writeTextFile(`${dir}/file`, "x");
    assertEquals(await inspectPath(dir), "present");
    assertEquals(await inspectPath(`${dir}/file`), "present");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
