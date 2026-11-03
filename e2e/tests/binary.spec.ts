// The standalone binary is configured by its environment only, as documented: a .env or a
// bunfig.toml in the directory it runs in (the data directory of the systemd unit) changes nothing
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { BINARY, E2E_DIR, ROOT } from '../harness/env'

test.skip(!BINARY, 'Runs the standalone binary')

test('the binary ignores a .env and a bunfig.toml in its working directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapraid-ui-binary-'))
  try {
    await writeFile(join(dir, '.env'), 'SNAPRAID_UI_VERSION=from-dotenv\n')
    await writeFile(join(dir, 'preload.js'), 'console.log("preloaded")\n')
    await writeFile(join(dir, 'bunfig.toml'), 'preload = ["./preload.js"]\n')
    const { version } = JSON.parse(await readFile(join(ROOT, 'apps', 'web', 'package.json'), 'utf8'))
    const { SNAPRAID_UI_VERSION: _, ...env } = process.env

    const output = execFileSync(resolve(E2E_DIR, BINARY as string), ['--version'], {
      cwd: dir,
      env,
      encoding: 'utf8',
    })

    expect(output.trim()).toBe(version)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
