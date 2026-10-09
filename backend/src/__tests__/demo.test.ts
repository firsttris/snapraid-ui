import { assertEquals } from "@std/assert";
import type { ParsedSnapRaidConfig } from "@shared/types.ts";
import { demoDataDiskUsage, demoDocker, demoParityUsage, demoStatusLog } from "../demo.ts";
import { inspectContainer, listContainers, pauseContainer, unpauseContainer } from "../docker.ts";
import { parseStatusOutput } from "../parsers/status-parser.ts";

const STATUS_LOG = await Deno.readTextFile(new URL("../parsers/__tests__/fixtures/status.log", import.meta.url));

// The fixture's array: two data disks and one parity
const CONFIG = {
  data: { d1: "/mnt/array/d1/", d2: "/mnt/array/d2/" },
  parity: [{ level: 1, keyword: "parity", paths: ["/mnt/array/parity/snapraid.parity"] }],
} as unknown as ParsedSnapRaidConfig;

Deno.test("demo status: the sizes of the demo disks, the paths of the sandbox", () => {
  const log = demoStatusLog(STATUS_LOG, CONFIG);
  const status = parseStatusOutput(log);

  assertEquals(status.disks?.map((d) => [d.name, d.usedGB, d.freeGB, d.files, d.fragmentedFiles]), [
    ["d1", 2760.5, 1240.2, 48213, 12],
    ["d2", 1240.2, 760.2, 61877, 3],
  ]);
  assertEquals(status.totalUsedGB, 4000.8);
  assertEquals(status.scrubPercentage, 64);
  assertEquals(status.oldestScrubDays, 17);
  assertEquals(status.hasErrors, false);
  assertEquals(status.syncIncomplete, false);
  // Each tag once: the sandbox's own figures are gone
  assertEquals(log.match(/^summary:disk_used:d1:/gm)?.length, 1);
  assertEquals(log.match(/^content_info:block:/gm)?.length, 1);
  // What SnapRAID reported about the disks themselves stays, and the log still ends with the exit
  assertEquals(log.includes("data:d1:/mnt/array/d1/:"), true);
  assertEquals(log.trimEnd().split("\n").at(-1), "summary:exit:ok");
});

Deno.test("demo usage: data disks and parity agree with the demo status", () => {
  assertEquals(demoDataDiskUsage(CONFIG), [
    { name: "d1", totalGB: 4000.8, freeGB: 1240.2 },
    { name: "d2", totalGB: 2000.4, freeGB: 760.2 },
  ]);
  const [parity] = demoParityUsage(CONFIG);
  // As large as the fullest data disk, on an 18 TB disk
  assertEquals(parity.files[0].fileSizeGB, 2760.5);
  assertEquals(parity.files[0].diskTotalGB, 18000.2);
  assertEquals(parity.capacityGB, 18000.2);
});

Deno.test("demo Docker: lists its containers, pauses and resumes them", async () => {
  assertEquals((await listContainers(demoDocker)).map((c) => [c.name, c.state]), [
    ["immich", "running"],
    ["jellyfin", "running"],
    ["nextcloud", "running"],
  ]);
  await pauseContainer(demoDocker, "jellyfin");
  assertEquals((await inspectContainer(demoDocker, "jellyfin")).state, "paused");
  await unpauseContainer(demoDocker, "jellyfin");
  assertEquals((await inspectContainer(demoDocker, "jellyfin")).state, "running");
  assertEquals((await demoDocker("POST", "/containers/postgres/pause")).status, 404);
});
