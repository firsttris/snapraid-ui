// SMART self-tests: started, followed and stopped on the SMART page. There are no disks to test,
// smartctl is a stand-in (harness/bin/smartctl): a test is at 90 %, then a short one is done.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createArray } from '../harness/array'
import { ARRAYS } from '../harness/env'
import { expect, test } from '../harness/fixtures'

test('a short self-test runs to the end, a long one can be stopped', async ({ page, app }) => {
  await rm(join(ARRAYS, '.smartctl'), { recursive: true, force: true })
  const array = await createArray('smart')
  await app.addArray(array, 'SMART')

  await page.goto('/smart')
  // SnapRAID's report covers all disks: below the details, not one of a disk's tabs
  await expect(page.getByText('Output of snapraid smart')).toBeVisible()
  await page.getByRole('button', { name: 'd1', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Raw output' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Self-test' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Self-test' })
  await expect(panel.getByText('No self-test has run yet.')).toBeVisible()

  await panel.getByRole('button', { name: /Start short test/ }).click()
  await expect(panel.getByText('Self-test running, 90 % left')).toBeVisible()
  // The card shows it too
  await expect(page.getByText('Self-test running · 90 % left').first()).toBeVisible()

  await panel.getByRole('button', { name: 'Check again' }).click()
  const short = panel.getByRole('row').filter({ hasText: 'Short offline' })
  await expect(short).toContainText('Passed')

  await panel.getByRole('button', { name: /Start long test/ }).click()
  await expect(page.getByRole('alertdialog')).toContainText('reads its whole surface (about 10 h)')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start long test' }).click()
  await expect(panel.getByText('Self-test running, 90 % left')).toBeVisible()
  await panel.getByRole('button', { name: 'Stop test' }).click()
  await expect(panel.getByRole('row').filter({ hasText: 'Extended offline' })).toContainText('Stopped')
  await expect(panel.getByRole('button', { name: /Start long test/ })).toBeVisible()
})
