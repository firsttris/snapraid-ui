// Where the end-to-end run keeps its tools, data and servers
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT = join(E2E_DIR, '..')
export const TOOLS = join(E2E_DIR, '.tools')
// smartctl for SMART self-tests: a stand-in, there are no disks to test; its state lives with the arrays
export const FAKE_SMARTCTL_DIR = join(E2E_DIR, 'harness', 'bin')
// Recreated on each run: the backend's data, the test arrays and the server logs
export const RUN_DIR = join(E2E_DIR, '.run')
// SNAPRAID_BASE_PATH of the backend: config.json, schedules.json, logs
export const BASE = join(RUN_DIR, 'base')
export const ARRAYS = join(RUN_DIR, 'arrays')

// Run against a Docker image of SnapRAID UI instead of the local backend and frontend,
// e.g. E2E_IMAGE=snapraid-ui:e2e (scripts/image-test.sh builds and runs it)
export const IMAGE = process.env.E2E_IMAGE
export const IMAGE_CONTAINER = 'snapraid-ui-e2e'

export const PORTS = {
  // The proxy in front of frontend and backend, like nginx in the Docker image;
  // the image's nginx itself listens on 80, it shares the host's network
  app: IMAGE ? 80 : 4173,
  frontend: 4174,
  backend: 4175,
  daemon: 4176,
  // Receives the webhook notifications of the tests
  webhook: 4177,
  // MQTT broker standing in for the one of Home Assistant
  mqtt: 4178,
}

export const APP_URL = `http://127.0.0.1:${PORTS.app}`
export const API_URL = `${APP_URL}/api`
export const DAEMON_URL = `http://127.0.0.1:${PORTS.daemon}`

export const SNAPRAID = join(TOOLS, 'snapraid')
export const SNAPRAID15 = join(TOOLS, 'snapraid15')
// snapraid-daemon's sys_engine: SnapRAID 15 with --test-skip-device
export const SNAPRAID15_SKIP_DEVICE = join(TOOLS, 'snapraid15-skip-device')
export const SNAPRAIDD = join(TOOLS, 'snapraidd')

// The array snapraid-daemon serves, set up before the servers start
export const DAEMON_ARRAY = 'daemon'
