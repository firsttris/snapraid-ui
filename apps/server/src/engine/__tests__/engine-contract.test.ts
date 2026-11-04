import { join } from "node:path";
import { runCommand } from "../../system/command.ts";
import { SNAPRAID_BIN, SNAPRAID_EXTRA_ARGS } from "../../config/config.ts";
import { createCliEngine } from "../cli-engine.ts";
import { createDaemonEngine } from "../daemon-engine.ts";
import { parseSnapRaidConfig } from "../../config/config-parser.ts";
import { createLogManager } from "../../snapraid/log-manager.ts";
import { engineContract } from "./engine-contract.ts";
import { createFakeEngine } from "./fake-engine.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

engineContract("fake", () => {
  const engine = createFakeEngine({ disks: ["d1", "d2"] });
  return Promise.resolve({
    engine,
    configPath: "/fake/snapraid.conf",
    dataDisks: ["d1", "d2"],
    addFile: (name) => engine.addFile(name),
  });
});

// The test disks are directories on one filesystem, SnapRAID only accepts that with --test-skip-device.
// Run it with: SNAPRAID_BIN=../../scripts/dev/bin/snapraid SNAPRAID_EXTRA_ARGS=--test-skip-device bun test
const cliAvailable = await (async () => {
  if (!SNAPRAID_EXTRA_ARGS.includes("--test-skip-device")) return false;
  try {
    const { code } = await runCommand([SNAPRAID_BIN, "--version"], { stdout: "ignore", stderr: "ignore" });
    return code === 0;
  } catch {
    return false;
  }
})();

engineContract("cli", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapraid-engine-"));
  const disk = (name: string) => join(dir, name);
  for (const name of ["d1", "d2", "parity", "logs"]) await mkdir(disk(name));
  await writeFile(join(disk("d1"), "photo.jpg"), crypto.getRandomValues(new Uint8Array(60_000)));
  await writeFile(join(disk("d2"), "movie.mkv"), crypto.getRandomValues(new Uint8Array(60_000)));

  const configPath = join(dir, "snapraid.conf");
  await writeFile(configPath, [
      `parity ${join(disk("parity"), "snapraid.parity")}`,
      `content ${join(disk("parity"), "snapraid.content")}`,
      `content ${join(disk("d1"), "snapraid.content")}`,
      `data d1 ${disk("d1")}/`,
      `data d2 ${disk("d2")}/`,
      "exclude *.content",
      "blocksize 64",
    ].join("\n"));

  return {
    engine: createCliEngine(createLogManager(disk("logs"))),
    configPath,
    dataDisks: ["d1", "d2"],
    addFile: (name) => writeFile(join(disk("d1"), name), crypto.getRandomValues(new Uint8Array(30_000))),
    cleanup: () => rm(dir, { recursive: true }),
  };
}, !cliAvailable);

// A running snapraid-daemon serving a throwaway array, e.g. the one docs/development.md sets up:
// SNAPRAID_TEST_DAEMON_URL=http://127.0.0.1:7627 SNAPRAID_TEST_DAEMON_CONF=/srv/dtest/snapraid.conf bun test
// The test adds files to the array's first data disk.
const daemonUrl = process.env.SNAPRAID_TEST_DAEMON_URL;
const daemonConf = process.env.SNAPRAID_TEST_DAEMON_CONF;

engineContract("daemon", async () => {
  const config = await parseSnapRaidConfig(daemonConf!);
  const [firstDisk] = Object.values(config.data);
  const added: string[] = [];
  return {
    // touch and status would go to the fallback, the contract does not run them
    engine: createDaemonEngine({ url: daemonUrl!, fallback: createFakeEngine(), pollMs: 200 }),
    configPath: daemonConf!,
    dataDisks: Object.keys(config.data),
    addFile: async (name) => {
      const path = join(firstDisk, `${Date.now()}-${name}`);
      added.push(path);
      await writeFile(path, crypto.getRandomValues(new Uint8Array(30_000)));
    },
    cleanup: async () => {
      for (const path of added) await rm(path).catch(() => {});
    },
  };
}, !daemonUrl || !daemonConf);
