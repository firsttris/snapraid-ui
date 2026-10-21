import { assertEquals } from "@std/assert";
import { join, toFileUrl } from "@std/path";
import { PACKAGE_JSON, readVersion } from "../version.ts";

const withEnv = async (value: string | undefined, run: () => Promise<void>) => {
  const before = Deno.env.get("SNAPRAID_UI_VERSION");
  if (value === undefined) Deno.env.delete("SNAPRAID_UI_VERSION");
  else Deno.env.set("SNAPRAID_UI_VERSION", value);
  try {
    await run();
  } finally {
    if (before === undefined) Deno.env.delete("SNAPRAID_UI_VERSION");
    else Deno.env.set("SNAPRAID_UI_VERSION", before);
  }
};

Deno.test("readVersion - the version of frontend/package.json", async () => {
  const { version } = JSON.parse(await Deno.readTextFile(PACKAGE_JSON));
  await withEnv(undefined, async () => assertEquals(await readVersion(), version));
});

Deno.test("readVersion - SNAPRAID_UI_VERSION overrides it", async () => {
  await withEnv("9.9.9", async () => assertEquals(await readVersion(), "9.9.9"));
});

Deno.test("readVersion - empty without package.json", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await withEnv(undefined, async () => assertEquals(await readVersion(toFileUrl(join(dir, "package.json"))), ""));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
