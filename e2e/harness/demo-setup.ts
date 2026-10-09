// Starts the demo for the README pictures (screenshots/readme.spec.ts): a fresh sandbox from
// dev/setup.sh with a few weeks of history, the backend in demo mode, the built frontend and the
// proxy in front of them, on the ports of the end-to-end run.
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { API_URL, PORTS, ROOT, RUN_DIR } from './env'
import { DENO_PERMISSIONS, findDeno } from './global-setup'
import { answers, type Server, startProcess, startProxy } from './servers'

const SANDBOX = join(ROOT, 'dev', 'sandbox')

export default async function demoSetup() {
  // DISKS_DIR=/mnt puts the disks where a server has them, as the pictures show them
  execFileSync('bash', [join(ROOT, 'dev', 'setup.sh'), '--reset'], { stdio: 'inherit' })
  await mkdir(RUN_DIR, { recursive: true })

  const frontend = join(ROOT, 'frontend')
  if (process.env.E2E_SKIP_BUILD !== '1') {
    execFileSync('npm', ['run', 'build'], { cwd: frontend, stdio: 'inherit' })
  }

  const servers: Server[] = []
  const stopAll = async () => {
    for (const server of servers.reverse()) await server.stop()
  }
  try {
    servers.push(
      await startProcess('backend', findDeno(), ['run', ...DENO_PERMISSIONS, 'src/main.ts'], {
        cwd: join(ROOT, 'backend'),
        // As ./start.sh --demo
        env: {
          PORT: String(PORTS.backend),
          SNAPRAID_BASE_PATH: SANDBOX,
          SNAPRAID_BIN: join(ROOT, 'dev', 'bin', 'snapraid'),
          SNAPRAID_EXTRA_ARGS: '--test-skip-device',
          SNAPRAID_DEMO: '1',
        },
        ready: answers(`http://127.0.0.1:${PORTS.backend}/api/config`),
      }),
    )
    servers.push(
      await startProcess('frontend', 'node', ['.output/server/index.mjs'], {
        cwd: frontend,
        env: { PORT: String(PORTS.frontend), HOST: '127.0.0.1' },
        ready: answers(`http://127.0.0.1:${PORTS.frontend}/`),
      }),
    )
    servers.push(await startProxy(PORTS.app, PORTS.frontend, PORTS.backend))
    if (!(await answers(`${API_URL}/config`)())) throw new Error('The proxy does not reach the backend')
  } catch (error) {
    await stopAll()
    throw error
  }
  return stopAll
}
