import { defineConfig, devices } from '@playwright/test'
import { APP_URL, IMAGE } from './harness/env'

// Kept apart, so a run against the image does not replace the results of the local run
const target = IMAGE ? 'image' : 'local'

// One backend runs one job at a time, so the tests run one after the other
export default defineConfig({
  testDir: './tests',
  globalSetup: './harness/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // SnapRAID jobs on the test arrays take seconds, a few steps each
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: `test-results/${target}`,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: `playwright-report/${target}` }]]
    : 'list',
  use: {
    baseURL: APP_URL,
    locale: 'en-US',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
