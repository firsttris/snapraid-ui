import { join } from "@std/path";
import { SNAPRAID_BIN, SNAPRAID_EXTRA_ARGS } from "../config.ts";
import { createCliEngine } from "../engine/cli-engine.ts";
import { createDaemonEngine } from "../engine/daemon-engine.ts";
import { parseSnapRaidConfig } from "../config-parser.ts";
import { createLogManager } from "../log-manager.ts";
import { engineContract } from "./engine-contract.ts";
import { createFakeEngine } from "./fake-engine.ts";

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
// Run it with: SNAPRAID_BIN=../dev/bin/snapraid SNAPRAID_EXTRA_ARGS=--test-skip-device deno test --allow-all
const cliAvailable = await (async () => {
  if (!SNAPRAID_EXTRA_ARGS.includes("--test-skip-device")) return false;
  try {
    const { code } = await new Deno.Command(SNAPRAID_BIN, { args: ["--version"], stdout: "null", stderr: "null" })
      .output();
    return code === 0;
  } catch {
    return false;
  }
})();

engineContract("cli", async () => {
  const dir = await Deno.makeTempDir({ prefix: "snapraid-engine-" });
  const disk = (name: string) => join(dir, name);
  for (const name of ["d1", "d2", "parity", "logs"]) await Deno.mkdir(disk(name));
  await Deno.writeFile(join(disk("d1"), "photo.jpg"), crypto.getRandomValues(new Uint8Array(60_000)));
  await Deno.writeFile(join(disk("d2"), "movie.mkv"), crypto.getRandomValues(new Uint8Array(60_000)));

  const configPath = join(dir, "snapraid.conf");
  await Deno.writeTextFile(
    configPath,
    [
      `parity ${join(disk("parity"), "snapraid.parity")}`,
      `content ${join(disk("parity"), "snapraid.content")}`,
      `content ${join(disk("d1"), "snapraid.content")}`,
      `data d1 ${disk("d1")}/`,
      `data d2 ${disk("d2")}/`,
      "exclude *.content",
      "blocksize 64",
    ].join("\n"),
  );

  return {
    engine: createCliEngine(createLogManager(disk("logs"))),
    configPath,
    dataDisks: ["d1", "d2"],
    addFile: (name) => Deno.writeFile(join(disk("d1"), name), crypto.getRandomValues(new Uint8Array(30_000))),
    cleanup: () => Deno.remove(dir, { recursive: true }),
  };
}, !cliAvailable);

// A running snapraid-daemon serving a throwaway array, e.g. the one docs/development.md sets up:
// SNAPRAID_TEST_DAEMON_URL=http://127.0.0.1:7627 SNAPRAID_TEST_DAEMON_CONF=/srv/dtest/snapraid.conf deno test --allow-all
// The test adds files to the array's first data disk.
const daemonUrl = Deno.env.get("SNAPRAID_TEST_DAEMON_URL");
const daemonConf = Deno.env.get("SNAPRAID_TEST_DAEMON_CONF");

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
      await Deno.writeFile(path, crypto.getRandomValues(new Uint8Array(30_000)));
    },
    cleanup: async () => {
      for (const path of added) await Deno.remove(path).catch(() => {});
    },
  };
}, !daemonUrl || !daemonConf);
