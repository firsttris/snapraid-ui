import { assertEquals } from "@std/assert";
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

Deno.test("applyCrcBaseline - the first count seen is the baseline, no warning", () => {
  const { disks, state } = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));

  assertEquals(disks[0].crcStableSince, day(0).toISOString());
  assertEquals(state["161120800043"], { count: 193, since: day(0).toISOString(), grownAt: null });
  assertEquals(assessSmart(disks[0]).level, "ok");
  assertEquals(attributeLevel(disks[0].attributes![0], disks[0]), "ok");
});

Deno.test("applyCrcBaseline - a growing count warns for a while, then counts as stable again", () => {
  const first = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));
  const grown = applyCrcBaseline("/c.conf", [disk("200")], first.state, day(10));

  assertEquals(grown.disks[0].crcStableSince, undefined);
  assertEquals(assessSmart(grown.disks[0]).reasons, [{ kind: "errors", attribute: "crc", count: 200 }]);

  const soon = applyCrcBaseline("/c.conf", [disk("200")], grown.state, day(20));
  assertEquals(soon.disks[0].crcStableSince, undefined);

  const later = applyCrcBaseline("/c.conf", [disk("200")], grown.state, day(41));
  assertEquals(later.disks[0].crcStableSince, day(10).toISOString());
});

Deno.test("applyCrcBaseline - a zero count forgets the disk, a sleeping disk keeps its entry", () => {
  const first = applyCrcBaseline("/c.conf", [disk("193")], {}, day(0));

  const asleep = applyCrcBaseline("/c.conf", [{ ...disk("0"), attributes: undefined, standby: true }], first.state, day(1));
  assertEquals(asleep.state, first.state);

  const cleared = applyCrcBaseline("/c.conf", [disk("0")], first.state, day(2));
  assertEquals(cleared.state, {});
});
