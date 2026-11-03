import { expect, test } from "bun:test";
import { buildSnapraidConf, contentPaths, nextDiskName, setupProblems } from "@shared/array-setup.ts";
import { candidateMounts, parseDfMounts } from "../setup.ts";

// df in a SnapRAID UI container: the overlay root, bind-mounted files, the data directory and the disks
const DF = `Filesystem     Type     1B-blocks          Used      Avail Mounted on
overlay        overlay  250000000000   80000000000 170000000000 /
tmpfs          tmpfs        67108864             0     67108864 /dev
/dev/sda2      ext4     250000000000   80000000000 170000000000 /etc/hosts
/dev/sda2      ext4     250000000000   80000000000 170000000000 /app/snapraid
/dev/sdb1      ext4    4000000000000 2500000000000 1500000000000 /mnt/disk1
/dev/sdc1      xfs     4000000000000 1000000000000 3000000000000 /mnt/disk 2
/dev/sdd1      ext4    6000000000000      50000000 5999950000000 /mnt/parity
/dev/sdb1      ext4    4000000000000 2500000000000 1500000000000 /mnt/disk1
/dev/sde1      ext4    8000000000000             0 8000000000000 /srv/disk10`;

test("candidateMounts - the disks, not the system, the app or files", () => {
  const mounts = candidateMounts(parseDfMounts(DF));
  expect(mounts.map((mount) => mount.path)).toEqual(["/mnt/disk 2", "/mnt/disk1", "/mnt/parity", "/srv/disk10"]);
  expect(mounts[1]).toEqual({
    device: "/dev/sdb1",
    fstype: "ext4",
    totalBytes: 4000000000000,
    usedBytes: 2500000000000,
    freeBytes: 1500000000000,
    path: "/mnt/disk1",
  });
});

const setup = {
  dataDisks: [{ name: "d1", path: "/mnt/disk1/" }, { name: "d2", path: "/mnt/disk2" }],
  parityPaths: ["/mnt/parity"],
};

test("buildSnapraidConf - parity, content files and data disks", () => {
  const conf = buildSnapraidConf(setup, "/app/snapraid", "media");
  expect(conf).toContain("parity /mnt/parity/snapraid.parity\n");
  expect(conf).toContain("content /app/snapraid/media.content\ncontent /mnt/disk1/snapraid.content\n");
  expect(conf).toContain("data d1 /mnt/disk1/\ndata d2 /mnt/disk2/\n");
  expect(conf.includes("//")).toEqual(false);
});

test("contentPaths - one more copy than parity levels, on different disks", () => {
  const twoParity = { ...setup, parityPaths: ["/mnt/parity", "/mnt/parity2"] };
  expect(contentPaths(twoParity, "/app/snapraid", "media")).toEqual([
    "/app/snapraid/media.content",
    "/mnt/disk1/snapraid.content",
    "/mnt/disk2/snapraid.content",
  ]);
  expect(buildSnapraidConf(twoParity, "/data", "m")).toContain("2-parity /mnt/parity2/snapraid.2-parity");
});

test("setupProblems - names, paths and disks inside others", () => {
  expect(setupProblems(setup)).toEqual([]);
  expect(setupProblems({ dataDisks: [], parityPaths: [] })).toEqual(["no_data", "no_parity"]);
  expect(setupProblems({ dataDisks: [{ name: "d 1", path: "mnt/a" }, { name: "d 1", path: "/mnt/b" }], parityPaths: ["/mnt/b/"] })).toEqual(["invalid_name", "duplicate_name", "relative_path", "duplicate_path"]);
  expect(setupProblems({ dataDisks: [{ name: "d1", path: "/mnt/disk1" }], parityPaths: ["/mnt/disk1/parity"] })).toEqual(["nested_path"]);
});

test("nextDiskName - the first free dN", () => {
  expect(nextDiskName([])).toEqual("d1");
  expect(nextDiskName(["d1", "d3"])).toEqual("d2");
});
