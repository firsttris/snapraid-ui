// The experimental daemon mode: snapraid-daemon 2.0 runs the jobs of its array
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openArray } from '../harness/array'
import { API_URL, DAEMON_ARRAY, DAEMON_URL, ROOT, SNAPRAID15 } from '../harness/env'
import { expect, expectHealth, test } from '../harness/fixtures'

// The version scripts/setup-tools.sh builds
const DAEMON_VERSION = readFileSync(join(ROOT, 'backend/src/engine/REVIEWED_DAEMON_VERSION'), 'utf8').trim()

interface DaemonTask {
  command: string
  status: string
  exit_code?: number
}

test('a sync of the daemon\'s array runs as a task of snapraid-daemon', async ({ page, app }) => {
  const array = openArray(DAEMON_ARRAY, { snapraid: SNAPRAID15 })
  await array.writeFile('d1', `photos/daemon-${Date.now()}.jpg`, 150)
  await app.addArray(array, 'Daemon array')
  try {
    await page.goto('/automation')
    await page.getByRole('switch', { name: 'snapraid-daemon' }).click()
    await page.getByRole('combobox', { name: 'Configuration the daemon serves' }).click()
    await page.getByRole('option', { name: /Daemon array/ }).click()
    await page.getByLabel('Daemon address').fill(DAEMON_URL)
    await page.getByRole('button', { name: 'Test connection' }).click()
    await expect(page.getByText(`Connected: snapraid-daemon ${DAEMON_VERSION} with SnapRAID`)).toContainText(
      `serving ${array.configPath}`,
    )
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.goto('/')
    await expectHealth(page, 'All good')
    await page.getByRole('button', { name: 'Sync', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'Prepare sync' })
    await expect(preview).toContainText('New')
    await preview.getByRole('button', { name: 'Start sync' }).click()
    await app.expectFinished('Sync')

    const tasks: { history: DaemonTask[] } = await (await fetch(`${DAEMON_URL}/snapraid/v1/tasks`)).json()
    expect(tasks.history.filter((task) => task.command === 'sync').at(-1)).toMatchObject({ status: 'terminated', exit_code: 0 })
    expect(await array.snapraid('diff')).toMatch(/No differences/)
  } finally {
    await app.api.put(`${API_URL}/engine`, { data: { mode: 'cli', daemons: [] } })
  }
})
