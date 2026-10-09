// The setup wizard: a new array from the disks, its configuration written by SnapRAID UI
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { API_URL, ARRAYS, BASE } from '../harness/env'
import { expect, expectHealth, test } from '../harness/fixtures'

const TB = 1e12
const mount = (path: string, totalTB: number, usedTB: number) => ({
  path,
  device: '/dev/sdx1',
  fstype: 'ext4',
  totalBytes: totalTB * TB,
  usedBytes: usedTB * TB,
  freeBytes: (totalTB - usedTB) * TB,
  empty: usedTB === 0,
  snapraidFiles: [],
})

test('a new array is set up from the disks and synced', async ({ page, app }) => {
  const dir = join(ARRAYS, 'wizard')
  const disk = (name: string) => join(dir, name)
  await rm(dir, { recursive: true, force: true })
  for (const name of ['disk1', 'disk2', 'parity']) await mkdir(disk(name), { recursive: true })
  await writeFile(join(disk('disk1'), 'photo.jpg'), randomBytes(200_000))
  await writeFile(join(disk('disk2'), 'movie.mkv'), randomBytes(300_000))

  // The test disks share one filesystem, so the detection is played by the browser
  await page.route('**/api/setup/mounts', (route) =>
    route.fulfill({ json: [mount(disk('disk1'), 4, 2), mount(disk('disk2'), 4, 1), mount(disk('parity'), 6, 0)] }),
  )
  // As after the first start: config.json points to a snapraid.conf that is not there
  const appConfig = await (await app.api.get(`${API_URL}/config`)).json()
  await app.api.post(`${API_URL}/config`, {
    data: { ...appConfig, snapraidConfigs: [{ name: 'Default', path: 'snapraid.conf', enabled: true }] },
  })
  try {
    await page.goto('/')
    await expect(page.getByText('No snapraid.conf yet')).toBeVisible()
    await page.getByRole('link', { name: 'Set up a new array' }).click()
    await expect(page.getByRole('button', { name: 'Add existing configuration' })).toBeVisible()
    await page.getByRole('button', { name: 'Set up a new array' }).click()

    await page.getByLabel('Name of the array').fill('Wizard')
    for (const [path, role] of [['disk1', 'Data'], ['disk2', 'Data'], ['parity', 'Parity']]) {
      await page.getByRole('combobox', { name: `Role of ${disk(path)}` }).click()
      await page.getByRole('option', { name: role, exact: true }).click()
    }
    await expect(page.getByLabel(`Name of ${disk('disk2')}`)).toHaveValue('d2')
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByText(`data d1 ${disk('disk1')}/`)).toBeVisible()
    await page.getByRole('button', { name: 'Create array' }).click()
    await expect(page.getByText('Wizard created')).toBeVisible()
    // The first sync starts right away
    await app.expectFinished('Sync')
    await expectHealth(page, 'All good')

    // The placeholder is gone, the new array took its place
    const configs = (await (await app.api.get(`${API_URL}/config`)).json()).snapraidConfigs
    expect(configs.map((config: { name: string }) => config.name)).toEqual(['Wizard'])

    const conf = await readFile(join(BASE, 'wizard.conf'), 'utf8')
    expect(conf).toContain(`parity ${disk('parity')}/snapraid.parity`)
    expect(conf).toContain(`content ${disk('disk1')}/snapraid.content`)
    expect(conf).toContain(`data d2 ${disk('disk2')}/`)
  } finally {
    await app.api.post(`${API_URL}/config/remove`, { data: { path: 'wizard.conf' } })
    await rm(join(BASE, 'wizard.conf'), { force: true })
  }
})

test('the wizard refuses a setup without parity, and a parity disk too small for the data', async ({ page }) => {
  await page.route('**/api/setup/mounts', (route) =>
    route.fulfill({ json: [mount('/mnt/big', 8, 6), mount('/mnt/small', 4, 0)] }),
  )
  await page.goto('/setup')
  await page.getByRole('button', { name: 'Set up a new array' }).click()
  await page.getByLabel('Name of the array').fill('Too small')

  await page.getByRole('combobox', { name: 'Role of /mnt/big' }).click()
  await page.getByRole('option', { name: 'Data', exact: true }).click()
  await expect(page.getByText('Pick at least one parity disk.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

  await page.getByRole('combobox', { name: 'Role of /mnt/small' }).click()
  await page.getByRole('option', { name: 'Parity', exact: true }).click()
  await expect(page.getByText('/mnt/small is smaller than the data on /mnt/big')).toBeVisible()
})
