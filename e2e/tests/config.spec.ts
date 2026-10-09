// Changing the array in the visual editor: SnapRAID UI writes snapraid.conf, SnapRAID picks it up
import { mkdir, readFile } from 'node:fs/promises'
import { createArray } from '../harness/array'
import { expect, test } from '../harness/fixtures'

test('a data disk added in the editor is protected by the next sync', async ({ page, app }) => {
  const array = await createArray('config')
  const newDisk = array.disk('d3')
  await mkdir(newDisk)
  await array.writeFile('d3', 'backups/archive.tar', 200)
  await app.addArray(array, 'Config')

  await page.goto('/')
  await page.getByRole('button', { name: 'Edit configuration' }).click()
  await page.getByRole('button', { name: 'Add Data Disk' }).click()
  await page.getByLabel('Disk Name').fill('d3')
  await page.getByLabel('Mount Path').fill(`${newDisk}/`)
  // The form's own Add button, the other sections have one too
  const form = page
    .locator('div')
    .filter({ has: page.getByLabel('Disk Name') })
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
    .last()
  await form.getByRole('button', { name: 'Add', exact: true }).click()

  await expect.poll(async () => readFile(array.configPath, 'utf8')).toContain(`data d3 ${newDisk}/`)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Prepare sync' })
  await expect(preview).toContainText('New')
  await preview.getByRole('button', { name: 'Start sync' }).click()
  await app.expectFinished('Sync')

  expect(await array.snapraid('diff')).toMatch(/No differences/)
  await expect(page.getByRole('table').getByRole('row', { name: /d3 .* Data/ })).toContainText('1')
})
