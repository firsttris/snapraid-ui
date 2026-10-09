// The recycle bin: files deleted or changed since the last sync come back from parity
import { appendFile, chmod, chown, rm, stat, unlink } from 'node:fs/promises'
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

test('restored files get the owner and permissions of their folder', async ({ page, app }) => {
  const array = await createArray('recovery-owner')
  const photos = join(array.disk('d1'), 'photos')
  await chmod(photos, 0o750)
  // As root here, a folder of another user shows the owner being taken over (in CI it is the runner's)
  if (process.getuid?.() === 0) await chown(photos, 1234, 2345)
  await unlink(join(photos, 'holiday.jpg'))
  // A whole folder gone: SnapRAID makes it again. Both on one disk, with one parity two deleted
  // files on different disks may share a block and can't come back
  await rm(join(array.disk('d1'), 'documents'), { recursive: true })
  await app.addArray(array, 'Recovery owner')

  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Restore all 2 deleted' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore all 2 deleted' }).click()
  await app.expectFinished('Restore')

  // Not root and mode 600, as SnapRAID leaves them
  const folder = await stat(photos)
  const holiday = await stat(join(photos, 'holiday.jpg'))
  expect({ uid: holiday.uid, gid: holiday.gid, mode: holiday.mode & 0o7777 }).toEqual({
    uid: folder.uid,
    gid: folder.gid,
    mode: 0o640,
  })
  // No other disk has the folder: like the disk's top folder
  const disk = await stat(array.disk('d1'))
  const documents = await stat(join(array.disk('d1'), 'documents'))
  const contract = await stat(join(array.disk('d1'), 'documents/contract.pdf'))
  expect({ uid: documents.uid, gid: documents.gid, mode: documents.mode & 0o7777 }).toEqual({
    uid: disk.uid,
    gid: disk.gid,
    mode: disk.mode & 0o7777,
  })
  expect({ uid: contract.uid, gid: contract.gid, mode: contract.mode & 0o7777 }).toEqual({
    uid: disk.uid,
    gid: disk.gid,
    mode: disk.mode & 0o666,
  })
})
