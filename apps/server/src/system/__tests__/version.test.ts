import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGE_JSON, readVersion } from "../version.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const withEnv = async (value: string | undefined, run: () => Promise<void>) => {
  const before = process.env.SNAPRAID_UI_VERSION;
  if (value === undefined) delete process.env.SNAPRAID_UI_VERSION;
  else process.env.SNAPRAID_UI_VERSION = value;
  try {
    await run();
  } finally {
    if (before === undefined) delete process.env.SNAPRAID_UI_VERSION;
    else process.env.SNAPRAID_UI_VERSION = before;
  }
};

test("readVersion - the version of apps/web/package.json", async () => {
  const { version } = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
  await withEnv(undefined, async () => expect(await readVersion()).toEqual(version));
});

test("readVersion - SNAPRAID_UI_VERSION overrides it", async () => {
  await withEnv("9.9.9", async () => expect(await readVersion()).toEqual("9.9.9"));
});

test("readVersion - empty without package.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-test-"));
  try {
    await withEnv(undefined, async () => expect(await readVersion(pathToFileURL(join(dir, "package.json")))).toEqual(""));
  } finally {
    await rm(dir, { recursive: true });
  }
});
