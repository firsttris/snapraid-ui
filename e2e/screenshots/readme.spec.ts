import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { ROOT } from '../harness/env'

/**
 * The pictures in the README and the documentation (docs/screenshot*.png, docs/screenshots/),
 * taken from the demo that harness/demo-setup.ts starts: npm run screenshots
 */

const DOCS = join(ROOT, 'docs')

test.describe.configure({ mode: 'serial' })

const shot = (page: Page, file: string) =>
  page.screenshot({ path: join(DOCS, file), animations: 'disabled', caret: 'hide' })

/** The dashboard once status, last runs, schedule and disks are in */
const openDashboard = async (page: Page) => {
  await page.goto('/')
  await expect(page.getByText('10 hours ago')).toBeVisible()
  await expect(page.getByText('64% verified')).toBeVisible()
  await expect(page.getByText(/full in about \d+ days/)).toBeVisible()
  await expect(page.getByText('Standby (spun down)')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

test('dashboard', async ({ page }) => {
  await openDashboard(page)
  await shot(page, 'screenshot.png')
})

test('dashboard, dark', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await openDashboard(page)
  await shot(page, 'screenshot-dark.png')
  await context.close()
})

test('command palette', async ({ page }) => {
  await openDashboard(page)
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog')).toBeVisible()
  await shot(page, 'screenshots/command-palette.png')
})

test('phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await openDashboard(page)
  await shot(page, 'screenshots/mobile.png')
  await context.close()
})

// Long pages in a tall window rather than as a full-page picture: the sidebar and the sticky
// save bar belong to the window and would end or stop halfway down
test('SMART', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1210 })
  await page.goto('/smart')
  await expect(page.getByText('Keep an eye on these disks')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await shot(page, 'screenshots/smart.png')
})

test('logs', async ({ page }) => {
  await page.goto('/logs')
  await expect(page.getByText(/6 logs/).first()).toBeVisible()
  // The last sync, with its overview
  await page.getByRole('button', { name: /^Sync\s*\d{2}:\d{2}/ }).first().click()
  await page.mouse.move(0, 0)
  await page.waitForLoadState('networkidle')
  await shot(page, 'screenshots/logs.png')
})

test('schedules', async ({ page }) => {
  await page.goto('/schedules')
  await expect(page.getByText('Nightly sync')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await shot(page, 'screenshots/schedules.png')
})

test('notifications', async ({ page }) => {
  await page.goto('/notifications')
  await page.waitForLoadState('networkidle')
  await shot(page, 'screenshots/notifications.png')
})

test('automation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1330 })
  await page.goto('/automation')
  await expect(page.getByText('immich').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await shot(page, 'screenshots/automation.png')
})

// The image for Settings → Social preview on GitHub, from the dark dashboard above
test('social preview', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
  await page.goto(`file://${join(ROOT, 'scripts', 'social-preview', 'social-preview.html')}`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(DOCS, 'social-preview.png') })
  await page.close()
})
