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

test('scrub finds silently corrupted data and fix repairs it', async ({ page, app }) => {
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
  await page.getByRole('button', { name: '1. Repair (fix -e)' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Repair' }).click()
  await app.expectFinished('Undelete')
  expect((await array.readFile('d1', 'photos/holiday.jpg')).equals(original)).toBe(true)

  await page.getByRole('button', { name: '2. Verify (scrub -p bad)' }).click()
  await app.expectFinished('Scrub')
  await expectHealth(page, 'All good')
})

test('undelete brings back a deleted file from parity', async ({ page, app }) => {
  const array = await createArray('undelete')
  const original = await array.readFile('d2', 'movies/trailer.mkv')
  await unlink(join(array.disk('d2'), 'movies/trailer.mkv'))
  await app.addArray(array, 'Undelete')
  await page.goto('/')

  await page.getByRole('button', { name: 'More commands' }).click()
  await page.getByRole('menuitem', { name: /Undelete/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Undelete Files' })
  await dialog.getByText('Restore All Missing Files').click()
  await dialog.getByRole('button', { name: 'Execute Undelete' }).click()

  await app.expectFinished('Undelete')
  expect((await array.readFile('d2', 'movies/trailer.mkv')).equals(original)).toBe(true)
})
