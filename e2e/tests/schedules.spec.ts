// Scheduled jobs, started with "Run now" instead of waiting for their time
import { appendFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { createArray } from '../harness/array'
import { API_URL } from '../harness/env'
import { expect, expectHealth, test } from '../harness/fixtures'

interface StoredSchedule {
  id: string
  name: string
  skipNext?: boolean
  lastOutcome?: {
    result: string
    skipReason?: string
    disks?: string[]
    updatedFiles?: number
    steps?: { command: string; result: string }[]
  }
}

// The outcome of the schedule's next run; between the steps of a routine no job runs for a moment
const waitForOutcome = async (api: APIRequestContext, name: string) => {
  let schedule: StoredSchedule | undefined
  await expect
    .poll(
      async () => {
        const schedules: StoredSchedule[] = await (await api.get(`${API_URL}/schedules`)).json()
        schedule = schedules.find((s) => s.name === name)
        return schedule?.lastOutcome?.result
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBeTruthy()
  return schedule!.lastOutcome!
}

test('the nightly routine runs touch, sync and scrub one after the other', async ({ page, app }) => {
  const array = await createArray('routine')
  await array.writeFile('d1', 'photos/new-photo.jpg', 150)
  await app.addArray(array, 'Routine')

  await page.goto('/schedules')
  await page.getByRole('button', { name: 'Create Schedule' }).click()
  const form = page.getByRole('dialog', { name: 'New schedule' })
  // A new sync schedule runs nothing extra until asked to
  await expect(form.getByRole('switch', { name: 'Run touch first' })).not.toBeChecked()
  await form.getByRole('switch', { name: 'Run touch first' }).click()
  await form.getByRole('switch', { name: 'Scrub afterwards' }).click()
  await form.getByText('New blocks only').click()
  await form.getByLabel('Name').fill('Nightly')
  await form.getByRole('button', { name: 'Create Schedule' }).click()
  await expect(page.getByText('Schedule "Nightly" created')).toBeVisible()
  await expect(form).toBeHidden()

  await page.getByRole('button', { name: 'Run now' }).click()
  await expect(page.getByText('Nightly started')).toBeVisible()
  const outcome = await waitForOutcome(app.api, 'Nightly')
  expect(outcome.result).toBe('ok')
  expect(outcome.steps?.map((step) => [step.command, step.result])).toEqual([
    ['touch', 'ok'],
    ['sync', 'ok'],
    ['scrub', 'ok'],
  ])
  await app.waitForIdle()
  expect(await array.snapraid('diff')).toMatch(/No differences/)

  await page.reload()
  await expect(page.getByText('Touch → Sync → Scrub (New blocks only)')).toBeVisible()
  // One result for the whole run while every step succeeded
  await expect(page.getByText('Succeeded', { exact: true })).toBeVisible()
  await expect(page.getByText('Sync: Succeeded')).toBeHidden()
})

test('a schedule left unnamed is named after its command and time', async ({ page, app }) => {
  const array = await createArray('unnamed')
  await app.addArray(array, 'Unnamed')

  await page.goto('/schedules')
  await page.getByRole('button', { name: 'Create Schedule' }).click()
  const form = page.getByRole('dialog', { name: 'New schedule' })
  await form.getByRole('radio', { name: /SMART/ }).click()
  await form.getByRole('radio', { name: 'Weekly' }).click()
  await form.getByRole('combobox', { name: 'Day of week' }).click()
  await page.getByRole('option', { name: 'Monday' }).click()
  await form.getByLabel('Time', { exact: true }).fill('04:30')
  await expect(form.locator('p', { hasText: 'Next runs:' })).toContainText('04:30')
  await form.getByRole('button', { name: 'Create Schedule' }).click()
  // The time as the browser's locale writes it, e.g. 04:30 AM
  await expect(page.getByText(/^Schedule "SMART · Every Monday at 04:30( AM)?" created$/)).toBeVisible()

  const [stored] = (await (await app.api.get(`${API_URL}/schedules`)).json()) as {
    command: string
    cronExpression: string
  }[]
  expect(stored).toMatchObject({ command: 'smart', cronExpression: '30 4 * * 1' })
  await expect(page.getByRole('region', { name: 'Next 7 days' })).toBeVisible()
})

test('a disk that is not mounted pauses the scheduled sync', async ({ page, app }) => {
  const array = await createArray('unmounted')
  await array.unmount('d1')
  await app.addArray(array, 'Unmounted')

  await page.goto('/')
  await expectHealth(page, 'Disk not available')
  await expect(page.getByText(/d1: .* is empty, but SnapRAID knows 3 files on it/)).toBeVisible()

  const created = await app.api.post(`${API_URL}/schedules`, {
    data: { name: 'Nightly sync', command: 'sync', configPath: array.storedPath, cronExpression: '0 2 * * *', maxDeletedFiles: 50 },
  })
  expect(created.ok()).toBe(true)
  await page.goto('/schedules')
  await page.getByRole('button', { name: 'Run now' }).click()

  const outcome = await waitForOutcome(app.api, 'Nightly sync')
  expect(outcome).toMatchObject({ result: 'skipped', skipReason: 'disk_missing', disks: ['d1'] })
  await page.reload()
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible()
  await expect(page.getByText(/d1 missing or empty/)).toBeVisible()

  // Back in place, nothing changed since the last sync: parity still has the files of d1
  await array.remount('d1')
  expect(await array.snapraid('diff')).toMatch(/No differences/)
  await page.goto('/')
  await expectHealth(page, 'All good')
})

test('mass changes, as ransomware leaves them, stop the scheduled sync', async ({ page, app }) => {
  const array = await createArray('ransomware')
  // Encrypted in place: same names, other content
  for (const file of ['photos/holiday.jpg', 'photos/birthday.jpg', 'documents/contract.pdf']) {
    await appendFile(join(array.disk('d1'), file), 'encrypted')
  }
  await app.addArray(array, 'Ransomware')
  const content = join(array.dir, 'parity', 'snapraid.content')
  const syncedAt = (await stat(content)).mtimeMs

  await app.api.post(`${API_URL}/schedules`, {
    data: {
      name: 'Nightly sync',
      command: 'sync',
      configPath: array.storedPath,
      cronExpression: '0 2 * * *',
      maxDeletedFiles: 50,
      maxUpdatedFiles: 2,
    },
  })
  await page.goto('/schedules')
  await expect(page.getByText('Sync guard: at most 50 deleted, at most 2 changed')).toBeVisible()
  await page.getByRole('button', { name: 'Run now' }).click()

  const outcome = await waitForOutcome(app.api, 'Nightly sync')
  expect(outcome).toMatchObject({ result: 'skipped', skipReason: 'too_many_updated', updatedFiles: 3 })
  await page.reload()
  await expect(page.getByText(/3 changed files, more than allowed/)).toBeVisible()
  // No sync ran: the content file, and with it the parity, is as before
  expect((await stat(content)).mtimeMs).toBe(syncedAt)
})

test('the next run of a schedule can be skipped and taken back', async ({ page, app }) => {
  const array = await createArray('skip')
  await app.addArray(array, 'Skip')
  await app.api.post(`${API_URL}/schedules`, {
    data: { name: 'Nightly sync', command: 'sync', configPath: array.storedPath, cronExpression: '0 2 * * *' },
  })
  const stored = async () =>
    ((await (await app.api.get(`${API_URL}/schedules`)).json()) as StoredSchedule[])[0]

  await page.goto('/schedules')
  const menu = page.getByRole('button', { name: 'More actions for Nightly sync' })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Skip next run' }).click()
  await expect(page.getByText('The next run of Nightly sync is skipped')).toBeVisible()
  await expect(page.getByText('Next run skipped')).toBeVisible()
  expect((await stored()).skipNext).toBe(true)

  await menu.click()
  await page.getByRole('menuitem', { name: 'Run next time again' }).click()
  await expect(page.getByText('Nightly sync runs next time again')).toBeVisible()
  await expect(page.getByText('Next run skipped')).toBeHidden()
  expect((await stored()).skipNext).toBe(false)
})
