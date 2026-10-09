// The recycle bin: files deleted or changed since the last sync come back from parity
import { appendFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createArray } from '../harness/array'
import { expect, test } from '../harness/fixtures'

test('deleted and encrypted files are restored to their state of the last sync', async ({ page, app }) => {
  const array = await createArray('recovery-bin')
  const trailer = await array.readFile('d2', 'movies/trailer.mkv')
  const holiday = await array.readFile('d1', 'photos/holiday.jpg')
  await unlink(join(array.disk('d2'), 'movies/trailer.mkv'))
  // As ransomware leaves it: same name, other content
  await appendFile(join(array.disk('d1'), 'photos/holiday.jpg'), 'encrypted')
  await app.addArray(array, 'Recovery')

  await page.goto('/recovery')
  await expect(page.getByRole('tab', { name: /Deleted\s*1/ })).toBeVisible()
  await page.getByRole('checkbox', { name: 'movies/trailer.mkv' }).check()
  await page.getByRole('button', { name: 'Restore 1 files' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore 1 files' }).click()
  await app.expectFinished('Restore')
  expect((await array.readFile('d2', 'movies/trailer.mkv')).equals(trailer)).toBe(true)

  await page.getByRole('tab', { name: /Changed\s*1/ }).click()
  await expect(page.getByText(/replaces the current content/)).toBeVisible()
  await page.getByRole('checkbox', { name: 'photos/holiday.jpg' }).check()
  await page.getByRole('button', { name: 'Restore 1 files' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore 1 files' }).click()
  await app.expectFinished('Restore')
  expect((await array.readFile('d1', 'photos/holiday.jpg')).equals(holiday)).toBe(true)

  await expect(page.getByText('2 files restored')).toBeVisible()
  await expect(page.getByText('Nothing to recover')).toBeVisible()
})

test('a file of the same path on another disk is left alone', async ({ page, app }) => {
  const array = await createArray('recovery-disks', {
    files: { d1: { 'shared/notes.txt': 20 }, d2: { 'shared/notes.txt': 20 } },
  })
  const original = await array.readFile('d1', 'shared/notes.txt')
  await appendFile(join(array.disk('d1'), 'shared/notes.txt'), 'changed on d1')
  await appendFile(join(array.disk('d2'), 'shared/notes.txt'), 'changed on d2')
  await app.addArray(array, 'Recovery disks')

  await page.goto('/recovery')
  await page.getByRole('tab', { name: /Changed\s*2/ }).click()
  await page.getByRole('searchbox', { name: 'Search files' }).or(page.getByLabel('Search files')).fill('d1')
  await page.getByRole('checkbox', { name: 'Select all shown files' }).check()
  await page.getByRole('button', { name: 'Restore 1 files' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore 1 files' }).click()
  await app.expectFinished('Restore')

  expect((await array.readFile('d1', 'shared/notes.txt')).equals(original)).toBe(true)
  expect((await array.readFile('d2', 'shared/notes.txt')).toString()).toContain('changed on d2')
})
