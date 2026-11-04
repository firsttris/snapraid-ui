import { expect, test } from "bun:test";
import { join } from "node:path";
import { BASE_PATH, resolveFromBase, toStoredPath } from "../config.ts";

test("resolveFromBase - relative paths are resolved against BASE_PATH", () => {
  expect(resolveFromBase("snapraid.conf")).toEqual(join(BASE_PATH, "snapraid.conf"));
  expect(resolveFromBase("configs/media.conf")).toEqual(join(BASE_PATH, "configs", "media.conf"));
});

test("resolveFromBase - absolute paths are kept as is", () => {
  expect(resolveFromBase("/mnt/parity/snapraid-media.conf")).toEqual("/mnt/parity/snapraid-media.conf");
});

test("toStoredPath - files inside BASE_PATH are stored relative", () => {
  expect(toStoredPath(join(BASE_PATH, "snapraid.conf"))).toEqual("snapraid.conf");
  expect(toStoredPath(join(BASE_PATH, "configs", "media.conf"))).toEqual(join("configs", "media.conf"));
  expect(toStoredPath("snapraid.conf")).toEqual("snapraid.conf");
});

test("toStoredPath - files outside BASE_PATH are stored absolute", () => {
  expect(toStoredPath("/etc/snapraid.conf")).toEqual("/etc/snapraid.conf");
  expect(toStoredPath("../outside.conf")).toEqual(resolveFromBase("../outside.conf"));
});
