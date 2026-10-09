// Docker containers are paused while SnapRAID reads the disks, through the real Docker socket
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createArray } from '../harness/array'
import { API_URL } from '../harness/env'
import { expect, test } from '../harness/fixtures'

const docker = async (...args: string[]) => (await promisify(execFile)('docker', args)).stdout.trim()
const dockerAvailable = await docker('info').then(() => true, () => false)
const CONTAINER = 'snapraid-ui-e2e-app'

test.skip(!dockerAvailable, 'Needs a running Docker daemon')

test('a container is paused during the sync and resumed after it', async ({ page, app }) => {
  await docker('rm', '-f', CONTAINER).catch(() => {})
  await docker('run', '-d', '--name', CONTAINER, 'busybox:1.36', 'sleep', '3600')
  const defaults = await (await app.api.get(`${API_URL}/maintenance`)).json()
  try {
    const array = await createArray('docker')
    await array.writeFile('d1', 'photos/new-photo.jpg', 150)
    await app.addArray(array, 'Docker')

    await page.goto('/automation')
    await page.getByRole('switch', { name: 'Pause Docker containers' }).click()
    await page.getByRole('checkbox', { name: new RegExp(CONTAINER) }).check()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    const since = String(Math.floor(Date.now() / 1000) - 1)
    await page.goto('/')
    await page.getByRole('button', { name: 'Sync', exact: true }).click()
    await page.getByRole('dialog', { name: 'Prepare sync' }).getByRole('button', { name: 'Start sync' }).click()
    await app.expectFinished('Sync')

    const events = await docker(
      'events', '--since', since, '--until', String(Math.floor(Date.now() / 1000) + 1),
      '--filter', `container=${CONTAINER}`, '--filter', 'type=container', '--format', '{{.Action}}',
    )
    expect(events.split('\n')).toEqual(['pause', 'unpause'])
    expect(await docker('inspect', '-f', '{{.State.Status}}', CONTAINER)).toBe('running')
  } finally {
    await app.api.put(`${API_URL}/maintenance`, { data: defaults })
    await docker('rm', '-f', CONTAINER).catch(() => {})
  }
})
