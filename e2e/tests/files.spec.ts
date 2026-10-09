// Duplicates cleaned up safely, and the files the last sync protected
import { appendFile, copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createArray } from '../harness/array'
import { expect, test } from '../harness/fixtures'

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

test('duplicates: the chosen copy stays, a copy changed since the sync is left alone', async ({ page, app }) => {
  const array = await createArray('duplicates', {
    files: { d1: { 'movies/a.mkv': 100, 'photos/b.jpg': 50 } },
    synced: false,
  })
  const copy = async (from: string, disk: string, to: string) => {
    const target = join(array.disk(disk), to)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(array.disk('d1'), from), target)
  }
  await copy('movies/a.mkv', 'd1', 'old/a.mkv')
  await copy('movies/a.mkv', 'd2', 'backup/a.mkv')
  await copy('photos/b.jpg', 'd2', 'backup/b.jpg')
  await array.snapraid('sync')
  // Changed after the sync: its content may no longer be the same
  await appendFile(join(array.disk('d2'), 'backup/b.jpg'), 'edited')
  await app.addArray(array, 'Duplicates')

  await page.goto('/duplicates')
  await expect(page.getByText('2 files with copies · 3 extra copies')).toBeVisible()
  // The copy in movies/ stays, for b.jpg the one in photos/ is picked by hand
  await page.getByLabel('Or the copy whose path contains').fill('movies/')
  await page.getByRole('radio', { name: /photos\/b\.jpg/ }).check()
  await page.getByText('Select all shown').click()
  await expect(page.getByText('3 copies selected')).toBeVisible()
  await page.getByRole('button', { name: 'Delete 3 copies' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete 3 copies' }).click()

  await expect(page.getByText(/2 copies deleted/)).toBeVisible()
  await expect(page.getByText('1 copies were left as they are')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'd2/backup/b.jpg' })).toContainText(
    'changed since the last sync',
  )
  expect(await exists(join(array.disk('d1'), 'movies/a.mkv'))).toBe(true)
  expect(await exists(join(array.disk('d1'), 'old/a.mkv'))).toBe(false)
  expect(await exists(join(array.disk('d2'), 'backup/a.mkv'))).toBe(false)
  expect(await exists(join(array.disk('d1'), 'photos/b.jpg'))).toBe(true)
  expect(await exists(join(array.disk('d2'), 'backup/b.jpg'))).toBe(true)
  // Deleted copies are no longer listed, though the content file still has them
  await expect(page.getByTestId('duplicate-group')).toHaveCount(1)

  // Until the next sync they can come back
  await page.getByRole('link', { name: 'Show deleted files' }).click()
  await expect(page.getByRole('tab', { name: /Deleted\s*2/ })).toHaveAttribute('aria-selected', 'true')
})

test('protected files: search with the disks of the matches, and folders, as of the last sync', async ({ page, app }) => {
  const array = await createArray('protected')
  // Added after the sync: not protected yet
  await array.writeFile('d1', 'photos/new.jpg', 10)
  await app.addArray(array, 'Protected')

  await page.goto('/files')
  await expect(page.getByText('5 files · 1.1 MB protected')).toBeVisible()

  const search = page.getByLabel('Is my file protected?')
  await search.fill('HOLIDAY')
  await expect(page.getByText('Protected: 1 files match')).toBeVisible()
  // The disk of the matches, with their size on hover
  await expect(page.getByTitle('300.0 KB')).toHaveText('d11')
  await search.fill('.')
  await expect(page.getByTitle('580.0 KB')).toHaveText('d13')
  await expect(page.getByTitle('550.0 KB')).toHaveText('d22')
  await search.fill('HOLIDAY')
  await expect(page.getByRole('row', { name: /photos\/holiday\.jpg d1 300\.0 KB/ })).toBeVisible()
  await search.fill('photos/new.jpg')
  await expect(page.getByText('No protected file matches.')).toBeVisible()
  await page.getByRole('link', { name: 'Show new files' }).click()
  await expect(page.getByRole('row', { name: /photos\/new\.jpg/ })).toBeVisible()

  await page.goto('/files')
  await page.getByRole('button', { name: /^photos/ }).click()
  await expect(page.getByRole('row', { name: /^birthday\.jpg d1/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^holiday\.jpg d1/ })).toBeVisible()
  await page.getByRole('button', { name: 'All disks' }).click()
  await expect(page.getByRole('button', { name: /^movies/ })).toBeVisible()
})
