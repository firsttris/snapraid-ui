import { assertEquals } from "@std/assert";
import { detectForceOption } from "@shared/force-option.ts";

Deno.test("detectForceOption - reads the switch SnapRAID suggests", () => {
  assertEquals(
    detectForceOption("msg:fatal: If you want to 'sync' anyway, use 'snapraid --force-empty sync'.\n"),
    "empty",
  );
  assertEquals(
    detectForceOption("If this an expected condition you can 'sync' anyway using 'snapraid --force-zero sync'\n"),
    "zero",
  );
  assertEquals(detectForceOption("you can still 'scrub', using 'snapraid --force-uuid scrub'.\n"), "uuid");
  assertEquals(detectForceOption("You can 'sync' anyway, using 'snapraid --force-device sync'.\n"), undefined);
  assertEquals(detectForceOption("Everything OK\n"), undefined);
});
