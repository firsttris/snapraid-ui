// Starts the demo for the README pictures (screenshots/readme.spec.ts): a fresh sandbox from
// dev/setup.sh with a few weeks of history and the backend in demo mode with the built frontend,
// on the port of the end-to-end run.
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT, RUN_DIR } from './env'
import { startBackend } from './global-setup'
import type { Server } from './servers'

const SANDBOX = join(ROOT, 'dev', 'sandbox')

export default async function demoSetup() {
  // DISKS_DIR=/mnt puts the disks where a server has them, as the pictures show them
  execFileSync('bash', [join(ROOT, 'dev', 'setup.sh'), '--reset'], { stdio: 'inherit' })
  await mkdir(RUN_DIR, { recursive: true })

  if (process.env.E2E_SKIP_BUILD !== '1') {
    execFileSync('npm', ['run', 'build'], { cwd: join(ROOT, 'frontend'), stdio: 'inherit' })
  }

  const servers: Server[] = []
  const stopAll = async () => {
    for (const server of servers.reverse()) await server.stop()
  }
  try {
    // As ./start.sh --demo
    servers.push(
      await startBackend({
        SNAPRAID_BASE_PATH: SANDBOX,
        SNAPRAID_BIN: join(ROOT, 'dev', 'bin', 'snapraid'),
        SNAPRAID_EXTRA_ARGS: '--test-skip-device',
        SNAPRAID_DEMO: '1',
      }),
    )
  } catch (error) {
    await stopAll()
    throw error
  }
  return stopAll
}
