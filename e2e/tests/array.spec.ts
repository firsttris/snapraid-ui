// The everyday jobs on a real array: status, sync with its preview, finding and repairing
// silent corruption, bringing back deleted files
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createArray } from '../harness/array'
import { expect, expectHealth, test } from '../harness/fixtures'

test('dashboard shows the health and the disks of the array', async ({ page, app }) => {
  const array = await createArray('dashboard')
  await app.addArray(array, 'Dashboard')
  await page.goto('/')

  await expectHealth(page, 'All good')
  const disks = page.getByRole('table')
  await expect(disks.getByRole('row', { name: /d1 .* Data/ })).toContainText('3')
  await expect(disks.getByRole('row', { name: /d2 .* Data/ })).toContainText('2')
  await expect(disks.getByRole('row', { name: /parity .* Parity 1/ })).toBeVisible()
})

test('sync shows the pending changes and writes them to parity', async ({ page, app }) => {
  const array = await createArray('sync')
  await array.writeFile('d1', 'photos/new-photo.jpg', 120)
  await unlink(join(array.disk('d2'), 'music/song.flac'))
  await app.addArray(array, 'Sync')
  await page.goto('/')

  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Prepare sync' })
  await expect(preview).toContainText('Deleted files: 1')
  await expect(preview).toContainText('d2: music/song.flac')
  await preview.getByRole('button', { name: 'Start sync' }).click()

  await app.expectFinished('Sync')
  expect(await array.snapraid('diff')).toMatch(/No differences/)

  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Prepare sync' })).toContainText('No changes since the last sync')
})

test('scrub finds silently corrupted data, one click repairs and verifies it', async ({ page, app }) => {
  const array = await createArray('recovery')
  const original = await array.readFile('d1', 'photos/holiday.jpg')
  await array.corrupt('d1', 'photos/holiday.jpg')

  await app.addArray(array, 'Recovery')
  await page.goto('/')
  await page.getByRole('button', { name: 'Scrub', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Start scrub' })
  await dialog.getByText('Full', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Start scrub' }).click()

  await expectHealth(page, 'Errors found', 60_000)
  await expect(page.getByText(/\d+ bad blocks found/)).toBeVisible()
  // One click: fix -e, then scrub -p bad, which clears the bad blocks
  await page.getByRole('button', { name: 'Repair and verify' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Repair' }).click()
  await expectHealth(page, 'All good', 90_000)
  await app.waitForIdle()
  expect((await array.readFile('d1', 'photos/holiday.jpg')).equals(original)).toBe(true)
  expect(await array.snapraid('status')).toContain('No error detected')
})

test('undelete: Changes in the sidebar brings back all deleted files from parity', async ({ page, app }) => {
  const array = await createArray('undelete')
  const original = await array.readFile('d2', 'movies/trailer.mkv')
  await unlink(join(array.disk('d2'), 'movies/trailer.mkv'))
  await app.addArray(array, 'Undelete')
  await page.goto('/')

  await page.getByRole('navigation', { name: 'Files' }).getByRole('link', { name: 'Changes' }).click()
  await expect(page.getByRole('tab', { name: /Deleted\s*1/ })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'Restore all 1 deleted' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('snapraid fix -m')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore all 1 deleted' }).click()

  await app.expectFinished('Restore')
  expect((await array.readFile('d2', 'movies/trailer.mkv')).equals(original)).toBe(true)
})

test('the dashboard runs Scrub and Sync, the menu the maintenance; status has its own page', async ({ page, app }) => {
  const array = await createArray('actions')
  await app.addArray(array, 'Actions')
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Status', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'More commands' }).click()
  // No pool directory in the config: no Pool
  await expect(page.getByRole('menuitem')).toHaveText([/^Check/, /^Touch/])
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Details →' }).click()
  await expect(page).toHaveURL(/\/integrity$/)
  await expect(page.getByRole('heading', { name: 'Integrity' })).toBeVisible()
  await expect(page.getByText('No problems found')).toBeVisible()
  await expect(page.getByText('Oldest block checked')).toBeVisible()
})

test('disks can be spun up and down by hand', async ({ page, app }) => {
  const array = await createArray('power')
  await app.addArray(array, 'Power')
  await page.goto('/')

  await page.getByRole('button', { name: 'Actions for d1' }).click()
  await page.getByRole('menuitem', { name: 'Spin down' }).click()
  // The test disks are directories: SnapRAID runs, and says it cannot spin them down
  await expect(page.getByText(/Spun down: d1|Spindown is unsupported|Failed/)).toBeVisible()

  await page.getByRole('button', { name: 'Spin up/down' }).click()
  await page.getByRole('menuitem', { name: 'Spin up all disks' }).click()
  await expect(page.getByText(/Spun up: all disks|Spinup is unsupported|Failed/)).toBeVisible()
})
