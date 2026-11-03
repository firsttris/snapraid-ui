import { expect, test } from "bun:test";
import type { SmartDiskInfo } from "@shared/types.ts";
import { assessSmart, attributeLevel } from "@shared/smart-health.ts";
import { applyCrcBaseline } from "../smart-baseline.ts";

const crc = { id: 199, name: "UDMA_CRC_Error_Count", value: 200, worst: 200, threshold: 0, raw: "193", flag: "" };
const disk = (raw: string): SmartDiskInfo => ({
  name: "ps3",
  device: "/dev/sde",
  status: "OK",
  serial: "161120800043",
  attributes: [{ ...crc, raw }],
});
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

test("applyCrcBaseline - the first count seen is the baseline, no warning", () => {
  const { disks, state } = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));

  expect(disks[0].crcStableSince).toEqual(day(0).toISOString());
  expect(state["161120800043"]).toEqual({ count: 193, since: day(0).toISOString(), grownAt: null });
  expect(assessSmart(disks[0]).level).toEqual("ok");
  expect(attributeLevel(disks[0].attributes![0], disks[0])).toEqual("ok");
});

test("applyCrcBaseline - a growing count warns for a while, then counts as stable again", () => {
  const first = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));
  const grown = applyCrcBaseline("/c.conf", [disk("200")], first.state, day(10));

  expect(grown.disks[0].crcStableSince).toEqual(undefined);
  expect(assessSmart(grown.disks[0]).reasons).toEqual([{ kind: "errors", attribute: "crc", count: 200 }]);

  const soon = applyCrcBaseline("/c.conf", [disk("200")], grown.state, day(20));
  expect(soon.disks[0].crcStableSince).toEqual(undefined);

  const later = applyCrcBaseline("/c.conf", [disk("200")], grown.state, day(41));
  expect(later.disks[0].crcStableSince).toEqual(day(10).toISOString());
});

test("applyCrcBaseline - a zero count forgets the disk, a sleeping disk keeps its entry", () => {
  const first = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));

  const asleep = applyCrcBaseline("/c.conf", [{ ...disk("0"), attributes: undefined, standby: true }], first.state, day(1));
  expect(asleep.state).toEqual(first.state);

  const cleared = applyCrcBaseline("/c.conf", [disk("0")], first.state, day(2));
  expect(cleared.state).toEqual({});
});
