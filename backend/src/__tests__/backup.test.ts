import { assertEquals, assertThrows } from "@std/assert";
import { BackupError, planRestore } from "../backup.ts";

const configJson = JSON.stringify({
  version: "1.0.0",
  snapraidConfigs: [
    { name: "Main", path: "snapraid.conf", enabled: true },
    { name: "Host", path: "/etc/snapraid.conf", enabled: true },
    { name: "Escape", path: "../outside.conf", enabled: true },
  ],
});

Deno.test("planRestore - writes settings and configs inside the data folder", () => {
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

  assertEquals(Object.keys(write).sort(), ["config.json", "schedules.json", "snapraid.conf"]);
  assertEquals(skipped.sort(), ["../outside.conf", "/etc/snapraid.conf", "logs/sync.log", "notifications.json", "other.conf"]);
});

Deno.test("planRestore - rejects other files", () => {
  assertThrows(() => planRestore({ hello: "world" }), BackupError);
  assertThrows(() => planRestore(null), BackupError);
});
