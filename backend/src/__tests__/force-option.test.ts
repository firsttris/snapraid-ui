import { expect, test } from "bun:test";
import { detectForceOption } from "@shared/force-option.ts";

test("detectForceOption - reads the switch SnapRAID suggests", () => {
  expect(detectForceOption("msg:fatal: If you want to 'sync' anyway, use 'snapraid --force-empty sync'.\n")).toEqual("empty");
  expect(detectForceOption("If this an expected condition you can 'sync' anyway using 'snapraid --force-zero sync'\n")).toEqual("zero");
  expect(detectForceOption("you can still 'scrub', using 'snapraid --force-uuid scrub'.\n")).toEqual("uuid");
  expect(detectForceOption("You can 'sync' anyway, using 'snapraid --force-device sync'.\n")).toEqual(undefined);
  expect(detectForceOption("Everything OK\n")).toEqual(undefined);
});
