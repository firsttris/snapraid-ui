import { expect, test } from "bun:test";
import { assertThrows } from "../../__tests__/assert-error.ts";
import { BackupError, planRestore } from "../backup.ts";

const configJson = JSON.stringify({
  version: "1.0.0",
  snapraidConfigs: [
    { name: "Main", path: "snapraid.conf", enabled: true },
    { name: "Host", path: "/etc/snapraid.conf", enabled: true },
    { name: "Escape", path: "../outside.conf", enabled: true },
  ],
});

test("planRestore - writes settings and configs inside the data folder", () => {
  const { write, skipped } = planRestore({
    app: "snapraid-ui",
    version: 1,
    exportedAt: "2026-01-01T00:00:00Z",
    files: {
      "config.json": configJson,
      "schedules.json": "[]",
      "notifications.json": "not json",
      "snapraid.conf": "parity /mnt/p/snapraid.parity",
      "/etc/snapraid.conf": "parity /mnt/p/snapraid.parity",
      "../outside.conf": "x",
      "other.conf": "not listed in config.json",
      "logs/sync.log": "x",
    },
  });

  expect(Object.keys(write).sort()).toEqual(["config.json", "schedules.json", "snapraid.conf"]);
  expect(skipped.sort()).toEqual(["../outside.conf", "/etc/snapraid.conf", "logs/sync.log", "notifications.json", "other.conf"]);
});

test("planRestore - rejects other files", () => {
  assertThrows(() => planRestore({ hello: "world" }), BackupError);
  assertThrows(() => planRestore(null), BackupError);
});
