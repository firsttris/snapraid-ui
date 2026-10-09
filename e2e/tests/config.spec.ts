// Changing the array on its configuration page: SnapRAID UI writes snapraid.conf, SnapRAID picks it up
import { mkdir, readFile } from 'node:fs/promises'
import { createArray } from '../harness/array'
import { expect, test } from '../harness/fixtures'

test('a data disk added on the configuration page is protected by the next sync', async ({ page, app }) => {
  const array = await createArray('config')
  const newDisk = array.disk('d3')
  await mkdir(newDisk)
  await array.writeFile('d3', 'backups/archive.tar', 200)
  await app.addArray(array, 'Config')

  await page.goto('/')
  await page.getByRole('link', { name: 'Configuration' }).click()
  await expect(page).toHaveURL(/\/array$/)
  await page.getByRole('button', { name: 'Add Data Disk' }).click()
  // The next free name is suggested
  await expect(page.getByLabel('Disk Name')).toHaveValue('d3')
  await page.getByLabel('Mount Path').fill(`${newDisk}/`)
  // The form's own Add button, the other sections have one too
  const form = page
    .locator('div')
    .filter({ has: page.getByLabel('Disk Name') })
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
    .last()
  await form.getByRole('button', { name: 'Add', exact: true }).click()

  await expect.poll(async () => readFile(array.configPath, 'utf8')).toContain(`data d3 ${newDisk}/`)
  await page.getByRole('link', { name: 'Dashboard' }).click()

  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Prepare sync' })
  await expect(preview).toContainText('New')
  await preview.getByRole('button', { name: 'Start sync' }).click()
  await app.expectFinished('Sync')

  expect(await array.snapraid('diff')).toMatch(/No differences/)
  await expect(page.getByRole('table').getByRole('row', { name: /d3 .* Data/ })).toContainText('1')
})

test('arrays are managed in one place and edited on their page', async ({ page, app }) => {
  const array = await createArray('manage')
  await app.addArray(array, 'Media')

  await page.goto('/')
  await page.getByRole('button', { name: 'Manage arrays' }).click()
  const manager = page.getByRole('dialog', { name: 'Manage arrays' })

  // Rename from the row's menu
  await manager.getByRole('button', { name: 'More actions for Media' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await manager.getByLabel('Name').fill('Movies')
  await manager.getByLabel('Name').press('Enter')
  await expect(manager.getByText('Movies', { exact: true })).toBeVisible()

  // Edit opens the array's page
  await manager.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page).toHaveURL(/\/array$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Movies')

  // Settings outside disks wait under Advanced; an option is saved when the field is left
  await page.getByText('Advanced', { exact: true }).click()
  await page.getByLabel('Autosave (GiB)').fill('50')
  await page.getByLabel('Autosave (GiB)').blur()
  await expect.poll(async () => readFile(array.configPath, 'utf8')).toMatch(/^autosave 50$/m)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // A new array starts the setup wizard right at the disks
  await page.getByRole('button', { name: 'Manage arrays' }).click()
  await page.getByRole('dialog', { name: 'Manage arrays' }).getByRole('button', { name: 'Set up a new array' }).click()
  await expect(page).toHaveURL(/\/setup\?start=new$/)
  await expect(page.getByRole('button', { name: 'Add existing configuration' })).toHaveCount(0)
})
