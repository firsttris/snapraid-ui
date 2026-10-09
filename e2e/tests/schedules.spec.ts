// Scheduled jobs, started with "Run now" instead of waiting for their time
import type { APIRequestContext } from '@playwright/test'
import { createArray } from '../harness/array'
import { API_URL } from '../harness/env'
import { expect, expectHealth, test } from '../harness/fixtures'

interface StoredSchedule {
  id: string
  name: string
  lastOutcome?: { result: string; skipReason?: string; disks?: string[]; steps?: { command: string; result: string }[] }
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
  await page.getByLabel('Name').fill('Nightly')
  // Touch before and scrub after are on for a new sync schedule
  await page.getByText('New blocks only').click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Schedule "Nightly" created')).toBeVisible()

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
  await expect(page.getByText('Sync: Succeeded')).toBeVisible()
  await expect(page.getByText('Scrub: Succeeded')).toBeVisible()
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
