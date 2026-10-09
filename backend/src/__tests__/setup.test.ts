import { assertEquals, assertStringIncludes } from "@std/assert";
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

Deno.test("candidateMounts - the disks, not the system, the app or files", () => {
  const mounts = candidateMounts(parseDfMounts(DF));
  assertEquals(mounts.map((mount) => mount.path), ["/mnt/disk 2", "/mnt/disk1", "/mnt/parity", "/srv/disk10"]);
  assertEquals(mounts[1], {
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

Deno.test("buildSnapraidConf - parity, content files and data disks", () => {
  const conf = buildSnapraidConf(setup, "/app/snapraid", "media");
  assertStringIncludes(conf, "parity /mnt/parity/snapraid.parity\n");
  assertStringIncludes(conf, "content /app/snapraid/media.content\ncontent /mnt/disk1/snapraid.content\n");
  assertStringIncludes(conf, "data d1 /mnt/disk1/\ndata d2 /mnt/disk2/\n");
  assertEquals(conf.includes("//"), false);
});

Deno.test("contentPaths - one more copy than parity levels, on different disks", () => {
  const twoParity = { ...setup, parityPaths: ["/mnt/parity", "/mnt/parity2"] };
  assertEquals(contentPaths(twoParity, "/app/snapraid", "media"), [
    "/app/snapraid/media.content",
    "/mnt/disk1/snapraid.content",
    "/mnt/disk2/snapraid.content",
  ]);
  assertStringIncludes(buildSnapraidConf(twoParity, "/data", "m"), "2-parity /mnt/parity2/snapraid.2-parity");
});

Deno.test("setupProblems - names, paths and disks inside others", () => {
  assertEquals(setupProblems(setup), []);
  assertEquals(setupProblems({ dataDisks: [], parityPaths: [] }), ["no_data", "no_parity"]);
  assertEquals(
    setupProblems({ dataDisks: [{ name: "d 1", path: "mnt/a" }, { name: "d 1", path: "/mnt/b" }], parityPaths: ["/mnt/b/"] }),
    ["invalid_name", "duplicate_name", "relative_path", "duplicate_path"],
  );
  assertEquals(
    setupProblems({ dataDisks: [{ name: "d1", path: "/mnt/disk1" }], parityPaths: ["/mnt/disk1/parity"] }),
    ["nested_path"],
  );
});

Deno.test("nextDiskName - the first free dN", () => {
  assertEquals(nextDiskName([]), "d1");
  assertEquals(nextDiskName(["d1", "d3"]), "d2");
});
