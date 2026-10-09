import { defineConfig } from '@playwright/test'
import { APP_URL } from './harness/env'

// The README and documentation pictures from the demo: npm run screenshots
export default defineConfig({
  testDir: './screenshots',
  globalSetup: './harness/demo-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/screenshots',
  reporter: 'list',
  use: {
    baseURL: APP_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  },
})
