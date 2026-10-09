// A failed data disk replaced in the wizard: fix restores it onto the new disk from parity
import { chmod, chown, mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createArray } from '../harness/array'
import { expect, test } from '../harness/fixtures'

const ownership = async (path: string) => {
  const info = await stat(path)
  return { uid: info.uid, gid: info.gid, mode: info.mode & 0o7777 }
}

test('a replaced disk gets its files back, owned like the same folders on the other disks', async ({ page, app }) => {
  const array = await createArray('replace', {
    files: { d1: { 'movies/old.mkv': 60 }, d2: { 'movies/trailer.mkv': 120, 'music/song.flac': 40 } },
  })
  const original = await array.readFile('d2', 'movies/trailer.mkv')
  const movies = join(array.disk('d1'), 'movies')
  await chmod(movies, 0o750)
  // As root here, a folder of another user shows the owner being taken over (in CI it is the runner's)
  if (process.getuid?.() === 0) await chown(movies, 1234, 2345)
  // d2 fails, an empty disk takes its place
  await rm(array.disk('d2'), { recursive: true })
  const newDisk = array.disk('d2-new')
  await mkdir(newDisk)
  await app.addArray(array, 'Replace')

  await page.goto('/array')
  await page.getByRole('listitem').filter({ hasText: '/d2/' }).getByRole('button', { name: 'Replace' }).click()
  const wizard = page.getByRole('dialog', { name: 'Replace disk d2' })
  await wizard.getByLabel('Mount point of the new disk').fill(`${newDisk}/`)
  await wizard.getByRole('button', { name: 'Start recovery' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start recovery' }).click()
  await app.expectFinished('Restore')

  expect((await array.readFile('d2-new', 'movies/trailer.mkv')).equals(original)).toBe(true)
  // Not root and mode 600: the folder on d1 tells, there is nothing older on the new disk
  const source = await ownership(movies)
  expect(await ownership(join(newDisk, 'movies'))).toEqual(source)
  expect(await ownership(join(newDisk, 'movies/trailer.mkv'))).toEqual({ ...source, mode: 0o640 })
  // A folder no other disk has: like the new disk's top folder
  const root = await ownership(newDisk)
  expect(await ownership(join(newDisk, 'music'))).toEqual(root)
  expect(await ownership(join(newDisk, 'music/song.flac'))).toEqual({ ...root, mode: root.mode & 0o666 })

  // The sync completes the replacement
  await wizard.getByRole('button', { name: 'Start sync' }).click()
  await app.expectFinished('Sync')
  await expect(wizard.getByText('d2 has been replaced')).toBeVisible()
  await wizard.getByRole('button', { name: 'Done' }).click()
  expect(await array.snapraid('diff')).toMatch(/No differences/)
})
