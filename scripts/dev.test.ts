// scripts/dev.ts (`bun run dev`, `bun run demo`) in a copy of the repository's layout whose
// apps/server and apps/web dev scripts and scripts/dev/setup.sh are stand-ins: each dev script
// notes its pid, its parent's (`bun run`) and a grandchild's, so a test sees what is left running.
import { afterEach, expect, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEV = join(import.meta.dir, 'dev.ts')
const APPS = ['server', 'web'] as const
type App = (typeof APPS)[number]

let root = ''
let pids: number[] = []

afterEach(() => {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  pids = []
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

/**
 * The layout dev.ts expects. Each app's dev script records `bun run`'s pid ($PPID), its own and
 * the one of a grandchild that sleeps, and the environment; `exit` makes the server's script
 * exit with that code once the web app's is running; `stubborn` makes the web app's grandchild
 * ignore SIGTERM. `setup` is scripts/dev/setup.sh's body.
 */
function sandbox({
  setup = 'exit 0',
  exit,
  stubborn = false,
}: {
  setup?: string
  exit?: number
  stubborn?: boolean
} = {}) {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'snapraid-ui-dev-')))
  mkdirSync(join(root, 'scripts/dev'), { recursive: true })
  copyFileSync(DEV, join(root, 'scripts/dev.ts'))
  writeFileSync(
    join(root, 'scripts/dev/setup.sh'),
    `echo ran > "${root}/setup.ran"\n${setup}\n`,
  )
  for (const app of APPS) {
    const dir = join(root, 'apps', app)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: app, scripts: { dev: 'sh dev.sh' } }),
    )
    const body =
      app === 'server' && exit !== undefined
        ? `while [ ! -s "${root}/web.grandchild" ]; do sleep 0.05; done\nexit ${exit}`
        : `sh -c '${stubborn && app === 'web' ? 'trap "" TERM; ' : ''}echo $$ > "${root}/${app}.grandchild.tmp"; mv "${root}/${app}.grandchild.tmp" "${root}/${app}.grandchild"; exec sleep 600'`
    writeFileSync(
      join(dir, 'dev.sh'),
      `env > "${root}/${app}.env"\necho $PPID $$ > "${root}/${app}.pids"\n${body}\n`,
    )
  }
}

const PROC = existsSync('/proc/self/stat')

/** Running; on Linux not a zombie that init has not reaped yet (a SIGKILLed orphan is one at first) */
function alive(pid: number) {
  try {
    if (PROC)
      return (
        readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.[0] !== 'Z'
      )
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(50)
  }
}

/** Runs dev.ts from another working directory than the root, as `bun scripts/dev.ts` does from anywhere */
function start(...args: string[]) {
  return Bun.spawn([process.execPath, join(root, 'scripts/dev.ts'), ...args], {
    cwd: tmpdir(),
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

/** Waits until both apps run with their grandchildren and returns all their pids */
async function running(apps: readonly App[] = APPS) {
  const files = apps
    .flatMap((app) => [`${app}.pids`, `${app}.grandchild`])
    .map((name) => join(root, name))
  await until(() =>
    files.every(
      (file) => existsSync(file) && readFileSync(file, 'utf8').trim() !== '',
    ),
  )
  pids = files.flatMap((file) =>
    readFileSync(file, 'utf8').trim().split(' ').map(Number),
  )
  expect(pids).toHaveLength(apps.length * 3)
  expect(pids.filter(alive)).toEqual(pids)
  return pids
}

function env(app: App) {
  return Object.fromEntries(
    readFileSync(join(root, `${app}.env`), 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  )
}

for (const [signal, code] of [
  ['SIGTERM', 143],
  ['SIGINT', 130],
  ['SIGHUP', 129],
] as const) {
  test(`${signal} stops both servers with everything they started, then exits ${code}`, async () => {
    sandbox()
    const dev = start()
    const started = await running()

    dev.kill(signal)
    expect(await dev.exited).toBe(code)

    expect(started.filter(alive)).toEqual([])
  }, 20_000)
}

test('a process that ignores SIGTERM gets SIGKILL after the grace time', async () => {
  sandbox({ stubborn: true })
  const dev = start()
  const started = await running()

  dev.kill('SIGTERM')
  expect(await dev.exited).toBe(143)

  expect(started.filter(alive)).toEqual([])
}, 20_000)

test('when one server exits, the other is stopped and its exit code is passed on', async () => {
  sandbox({ exit: 7 })
  const dev = start()
  const web = await running(['web'])

  expect(await dev.exited).toBe(7)

  expect(web.filter(alive)).toEqual([])
}, 20_000)

test('without --demo both get ./snapraid as base path, which is created, and setup.sh does not run', async () => {
  sandbox()
  const dev = start()
  await running()
  dev.kill('SIGTERM')
  await dev.exited

  for (const app of APPS) {
    expect(env(app).SNAPRAID_BASE_PATH).toBe(join(root, 'snapraid'))
    expect(env(app).SNAPRAID_DEMO).toBeUndefined()
  }
  expect(existsSync(join(root, 'snapraid'))).toBe(true)
  expect(existsSync(join(root, 'setup.ran'))).toBe(false)
}, 20_000)

test('--demo runs setup.sh and gives both the sandbox, its snapraid and the demo flags', async () => {
  sandbox()
  const dev = start('--demo')
  await running()
  dev.kill('SIGTERM')
  await dev.exited

  expect(existsSync(join(root, 'setup.ran'))).toBe(true)
  for (const app of APPS) {
    expect(env(app)).toMatchObject({
      SNAPRAID_BASE_PATH: join(root, 'scripts/dev/sandbox'),
      SNAPRAID_BIN: join(root, 'scripts/dev/bin/snapraid'),
      SNAPRAID_EXTRA_ARGS: '--test-skip-device',
      SNAPRAID_DEMO: '1',
    })
  }
  expect(existsSync(join(root, 'snapraid'))).toBe(false)
}, 20_000)

test('--demo aborts with exit code 1 when setup.sh fails, before starting anything', async () => {
  sandbox({ setup: 'exit 3' })
  const dev = start('--demo')

  expect(await dev.exited).toBe(1)

  expect(existsSync(join(root, 'setup.ran'))).toBe(true)
  for (const app of APPS)
    expect(existsSync(join(root, `${app}.pids`))).toBe(false)
}, 20_000)
