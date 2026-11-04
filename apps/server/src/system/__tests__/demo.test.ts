import { expect, test } from "bun:test";
import type { ParsedSnapRaidConfig } from "@shared/types.ts";
import { demoDataDiskUsage, demoDocker, demoParityUsage, demoStatusLog } from "../demo.ts";
import { inspectContainer, listContainers, pauseContainer, unpauseContainer } from "../docker.ts";
import { parseStatusOutput } from "../../parsers/status-parser.ts";
import { readFile } from "node:fs/promises";

const STATUS_LOG = await readFile(new URL("../../parsers/__tests__/fixtures/status.log", import.meta.url), "utf8");

// The fixture's array: two data disks and one parity
const CONFIG = {
  data: { d1: "/mnt/array/d1/", d2: "/mnt/array/d2/" },
  parity: [{ level: 1, keyword: "parity", paths: ["/mnt/array/parity/snapraid.parity"] }],
} as unknown as ParsedSnapRaidConfig;

test("demo status: the sizes of the demo disks, the paths of the sandbox", () => {
  const log = demoStatusLog(STATUS_LOG, CONFIG);
  const status = parseStatusOutput(log);

  expect(status.disks?.map((d) => [d.name, d.usedGB, d.freeGB, d.files, d.fragmentedFiles])).toEqual([
    ["d1", 2760.5, 1240.2, 48213, 12],
    ["d2", 1240.2, 760.2, 61877, 3],
  ]);
  expect(status.totalUsedGB).toEqual(4000.8);
  expect(status.scrubPercentage).toEqual(64);
  expect(status.oldestScrubDays).toEqual(17);
  expect(status.hasErrors).toEqual(false);
  expect(status.syncIncomplete).toEqual(false);
  // Each tag once: the sandbox's own figures are gone
  expect(log.match(/^summary:disk_used:d1:/gm)?.length).toEqual(1);
  expect(log.match(/^content_info:block:/gm)?.length).toEqual(1);
  // What SnapRAID reported about the disks themselves stays, and the log still ends with the exit
  expect(log.includes("data:d1:/mnt/array/d1/:")).toEqual(true);
  expect(log.trimEnd().split("\n").at(-1)).toEqual("summary:exit:ok");
});

test("demo usage: data disks and parity agree with the demo status", () => {
  expect(demoDataDiskUsage(CONFIG)).toEqual([
    { name: "d1", totalGB: 4000.8, freeGB: 1240.2 },
    { name: "d2", totalGB: 2000.4, freeGB: 760.2 },
  ]);
  const [parity] = demoParityUsage(CONFIG);
  // As large as the fullest data disk, on an 18 TB disk
  expect(parity.files[0].fileSizeGB).toEqual(2760.5);
  expect(parity.files[0].diskTotalGB).toEqual(18000.2);
  expect(parity.capacityGB).toEqual(18000.2);
});

test("demo Docker: lists its containers, pauses and resumes them", async () => {
  expect((await listContainers(demoDocker)).map((c) => [c.name, c.state])).toEqual([
    ["immich", "running"],
    ["jellyfin", "running"],
    ["nextcloud", "running"],
  ]);
  await pauseContainer(demoDocker, "jellyfin");
  expect((await inspectContainer(demoDocker, "jellyfin")).state).toEqual("paused");
  await unpauseContainer(demoDocker, "jellyfin");
  expect((await inspectContainer(demoDocker, "jellyfin")).state).toEqual("running");
  expect((await demoDocker("POST", "/containers/postgres/pause")).status).toEqual(404);
});
