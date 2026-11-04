// `bun run dev` / `bun run demo`: runs the backend (`bun run dev` in apps/server, :8080) and
// the frontend (`bun run dev` in apps/web, Vite on :3000) side by side, with Bun alone.
//
//   bun scripts/dev.ts          -> uses ./snapraid and the system snapraid binary
//   bun scripts/dev.ts --demo   -> uses the dev sandbox (see scripts/dev/setup.sh)
//
// Each command runs in a process group of its own (as ccu-addon-mui's scripts/dev.ts), so
// stopping it stops everything it started too (bun --watch, Vite and their children). When
// one of the two exits, the other is stopped and this script exits with the first one's code.
// SIGINT (Ctrl+C), SIGTERM (kill, an IDE) and SIGHUP (closing the terminal) go on to both
// groups; once they are gone the script exits with 128 + the signal's number (130 for Ctrl+C).
import { mkdirSync } from 'node:fs'
import { constants } from 'node:os'
import { dirname, join } from 'node:path'

type Child = ReturnType<typeof Bun.spawn>

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
/** How long a group may take to exit after SIGTERM before it gets SIGKILL */
const GRACE_MS = 5_000

// The repository's root, one level above scripts/, whatever the working directory
const root = dirname(import.meta.dir)
const demo = process.argv[2] === '--demo'

/** The environment both servers get, as the former fish script scripts/start.sh set it */
const environment = (demo: boolean): Record<string, string> =>
  demo
    ? {
        SNAPRAID_BASE_PATH: join(root, 'scripts/dev/sandbox'),
        SNAPRAID_BIN: join(root, 'scripts/dev/bin/snapraid'),
        // All sandbox "disks" live on one filesystem, which snapraid rejects without this
        SNAPRAID_EXTRA_ARGS: '--test-skip-device',
        // Sandbox disks are directories without SMART, the backend fakes smart and probe
        SNAPRAID_DEMO: '1',
      }
    : { SNAPRAID_BASE_PATH: join(root, 'snapraid') }

const children: Child[] = []
/** Set once a signal arrived: the code to exit with */
let stopping: number | undefined
/** Resolves with that code once both groups are gone */
const signalled = Promise.withResolvers<number>()

/** Sends a signal to a child's whole process group; it may have exited already */
const signalGroup = (child: Child, signal: NodeJS.Signals) => {
  try {
    process.kill(-child.pid, signal)
  } catch {
    // the group is gone
  }
}

const groupAlive = (child: Child) => {
  try {
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

/** Waits until a child and everything in its group has exited, with SIGKILL after the grace time */
const reap = async (child: Child) => {
  const end = Date.now() + GRACE_MS
  while (groupAlive(child) && Date.now() < end) await Bun.sleep(50)
  if (groupAlive(child)) signalGroup(child, 'SIGKILL')
  await child.exited
}

const stopAll = async (signal: NodeJS.Signals) => {
  for (const child of children) signalGroup(child, signal)
  await Promise.all(children.map(reap))
}

for (const signal of SIGNALS) {
  process.on(signal, async () => {
    if (stopping !== undefined) return
    stopping = 128 + constants.signals[signal]
    await stopAll(signal)
    signalled.resolve(stopping)
  })
}

const exitIfSignalled = async () => {
  if (stopping !== undefined) process.exit(await signalled.promise)
}

const spawn = (cmd: string[], cwd: string, env: Record<string, string>) => {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  })
  children.push(child)
  return child
}

if (demo) {
  // Build binary and sandbox on first run, no-op afterwards
  const setup = spawn(['bash', join(root, 'scripts/dev/setup.sh')], root, {})
  const code = await setup.exited
  children.length = 0
  await exitIfSignalled()
  if (code !== 0) process.exit(1)
}

await exitIfSignalled()
const env = environment(demo)
// Local data directory, the backend fills it on first start
if (!demo) mkdirSync(env.SNAPRAID_BASE_PATH, { recursive: true })

// process.execPath is the Bun running this script, so no other Bun has to be on the PATH
const servers = [
  spawn([process.execPath, 'run', 'dev'], join(root, 'apps/server'), env),
  spawn([process.execPath, 'run', 'dev'], join(root, 'apps/web'), env),
]

const code = await Promise.race(servers.map((child) => child.exited))
await exitIfSignalled()
// A signal from now on finds the stop under way and leaves the exit code alone
stopping = code
await stopAll('SIGTERM')
process.exit(code)
