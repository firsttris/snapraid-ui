import { assertEquals } from "@std/assert";
import type { SmartDiskInfo } from "@shared/types.ts";
import { addSmartPoints } from "../smart-history.ts";

const disk = (temperature: number, crc: string): SmartDiskInfo => ({
  name: "d1",
  device: "/dev/sda",
  status: "OK",
  serial: "S1",
  temperature,
  attributes: [{ id: 199, name: "UDMA_CRC_Error_Count", value: 200, worst: 200, threshold: 0, raw: crc, flag: "" }],
});

Deno.test("addSmartPoints - one point per day, a later read replaces it", () => {
  const first = addSmartPoints("/c.conf", [disk(30, "1")], {}, new Date("2026-01-01T08:00:00Z"));
  const again = addSmartPoints("/c.conf", [disk(35, "2")], first, new Date("2026-01-01T20:00:00Z"));
  const next = addSmartPoints("/c.conf", [disk(33, "2")], again, new Date("2026-01-02T08:00:00Z"));

  assertEquals(next["S1"].points.map((point) => [point.date, point.temperature, point.crc]), [
    ["2026-01-01", 35, 2],
    ["2026-01-02", 33, 2],
  ]);
  assertEquals(next["S1"].configPath, "/c.conf");
});

Deno.test("addSmartPoints - sleeping disks add nothing", () => {
  const state = addSmartPoints("/c.conf", [{ ...disk(30, "0"), standby: true, attributes: undefined }], {});
  assertEquals(state, {});
});
