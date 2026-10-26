// Starts what the tests run against: snapraid-daemon on its own array, the backend with
// SnapRAID 15 for the CLI jobs, which serves the built frontend as well.
// With E2E_IMAGE a container of that image takes the place of the backend.
// The data lives in e2e/.run/, recreated on each run.
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createArray } from './array'
import {
  API_URL,
  APP_URL,
  ARRAYS,
  BASE,
  BINARY,
  DAEMON_ARRAY,
  DAEMON_URL,
  E2E_DIR,
  FAKE_SMARTCTL_DIR,
  IMAGE,
  IMAGE_CONTAINER,
  PORTS,
  ROOT,
  RUN_DIR,
  SNAPRAID,
  SNAPRAID15,
  SNAPRAID15_SKIP_DEVICE,
  SNAPRAIDD,
} from './env'
import { answers, type Server, startProcess } from './servers'

export const DENO_PERMISSIONS = [
  '--allow-net',
  '--allow-read',
  '--allow-write',
  '--allow-run',
  '--allow-env',
  '--allow-sys=networkInterfaces,hostname',
]

export const findDeno = () => {
  if (process.env.DENO_BIN) return process.env.DENO_BIN
  const local = join(ROOT, 'dev', 'tools', 'deno')
  if (existsSync(local)) return local
  return 'deno'
}

const startDaemon = async (): Promise<Server> => {
  const array = await createArray(DAEMON_ARRAY, { snapraid: SNAPRAID15 })
  const dir = join(RUN_DIR, 'snapraidd')
  await mkdir(dir, { recursive: true })
  // No schedule, spindown, hooks or notifications of its own, SnapRAID UI does those
  const conf = join(dir, 'snapraidd.conf')
  await writeFile(
    conf,
    [
      'net_enabled = 1',
      `net_port = 127.0.0.1:${PORTS.daemon}`,
      'net_web_root =',
      `sys_engine = ${SNAPRAID15_SKIP_DEVICE}`,
      'notify_syslog_enabled = 0',
      'check_updates = 0',
      '',
    ].join('\n'),
  )
  return startProcess(
    'snapraidd',
    SNAPRAIDD,
    ['-f', '-c', conf, '-C', array.configPath, '-p', join(dir, 'snapraidd.pid')],
    { ready: answers(`${DAEMON_URL}/snapraid/v1/array`) },
  )
}

/**
 * The backend with the built frontend on the app's port (or another one), ready once both answer:
 * from the sources, or with E2E_BINARY the standalone binary, which carries the frontend inside
 */
export const startBackend = (
  env: Record<string, string>,
  { name = 'backend', port = PORTS.app }: { name?: string; port?: number } = {},
): Promise<Server> => {
  const url = port === PORTS.app ? APP_URL : `http://127.0.0.1:${port}`
  const options = {
    env: { PORT: String(port), ...env },
    // Any answer from the API: with the login on, it is a 401
    ready: async () => (await answers(`${url}/api/config`)()) && (await fetch(`${url}/`)).ok,
  }
  if (BINARY) return startProcess(name, resolve(E2E_DIR, BINARY), [], { ...options, cwd: RUN_DIR })
  return startProcess(name, findDeno(), ['run', ...DENO_PERMISSIONS, 'src/main.ts'], {
    ...options,
    cwd: join(ROOT, 'backend'),
  })
}

const docker = (...args: string[]) => promisify(execFile)('docker', args, { maxBuffer: 64 * 1024 * 1024 })

/**
 * The image as users run it (docker/docker-compose.yml): data in /app/snapraid, the disks at
 * the same paths as on the host, the Docker socket for the pause. On the host's network, so
 * the backend reaches snapraid-daemon and the tests' webhook receiver on 127.0.0.1.
 */
const startImage = async (image: string): Promise<Server> => {
  await docker('rm', '-f', IMAGE_CONTAINER).catch(() => {})
  await docker(
    'run', '-d', '--name', IMAGE_CONTAINER, '--network', 'host',
    '-v', `${BASE}:/app/snapraid`,
    '-v', `${ARRAYS}:${ARRAYS}`,
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    // As in the compose file: SnapRAID resolves the disks' devices for smart and probe
    '--privileged',
    // The test disks are directories on one filesystem
    '-e', 'SNAPRAID_EXTRA_ARGS=--test-skip-device',
    '-v', `${FAKE_SMARTCTL_DIR}:/e2e-bin:ro`,
    '-e', 'SMARTCTL_BIN=/e2e-bin/smartctl',
    '-e', `FAKE_SMARTCTL_STATE=${join(ARRAYS, '.smartctl')}`,
    image,
  )
  const deadline = Date.now() + 60_000
  while (!(await answers(`${API_URL}/config`)().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`${image} did not start, see: docker logs ${IMAGE_CONTAINER}`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return {
    name: 'image',
    stop: async () => {
      const { stdout, stderr } = await docker('logs', IMAGE_CONTAINER).catch(() => ({ stdout: '', stderr: '' }))
      await writeFile(join(RUN_DIR, 'image.log'), stdout + stderr)
      // The container wrote as root, give the files back so the next run can remove them
      const owner = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`
      await docker('exec', IMAGE_CONTAINER, 'chown', '-R', owner, '/app/snapraid', ARRAYS).catch(() => {})
      await docker('rm', '-f', IMAGE_CONTAINER).catch(() => {})
    },
  }
}

export default async function globalSetup() {
  for (const tool of [SNAPRAID, SNAPRAID15, SNAPRAID15_SKIP_DEVICE, SNAPRAIDD]) {
    if (!existsSync(tool)) throw new Error(`${tool} is missing, run: npm run setup`)
  }

  await rm(RUN_DIR, { recursive: true, force: true })
  await mkdir(join(BASE, 'logs'), { recursive: true })
  // The tests add their arrays themselves
  await writeFile(
    join(BASE, 'config.json'),
    JSON.stringify({
      version: '1.0.0',
      snapraidConfigs: [],
      logs: { maxHistoryEntries: 50, directory: 'logs', maxFiles: 100, maxAge: 30 },
    }),
  )

  await mkdir(ARRAYS, { recursive: true })
  const frontend = join(ROOT, 'frontend')
  if (!IMAGE && !BINARY && process.env.E2E_SKIP_BUILD !== '1') {
    execFileSync('npm', ['run', 'build'], { cwd: frontend, stdio: 'inherit' })
  }

  const servers: Server[] = []
  const stopAll = async () => {
    for (const server of servers.reverse()) await server.stop()
  }
  try {
    servers.push(await startDaemon())
    if (IMAGE) {
      servers.push(await startImage(IMAGE))
      return stopAll
    }
    servers.push(
      await startBackend({
        SNAPRAID_BASE_PATH: BASE,
        SNAPRAID_BIN: SNAPRAID,
        SNAPRAID_EXTRA_ARGS: '--test-skip-device',
        SMARTCTL_BIN: join(FAKE_SMARTCTL_DIR, 'smartctl'),
        FAKE_SMARTCTL_STATE: join(ARRAYS, '.smartctl'),
      }),
    )
  } catch (error) {
    await stopAll()
    throw error
  }

  return stopAll
}
