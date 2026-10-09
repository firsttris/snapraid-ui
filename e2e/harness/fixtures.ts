// The `app` fixture: adds test arrays to SnapRAID UI, opens them in the browser and
// removes them, the schedules and the notification settings again after the test
import { type APIRequestContext, test as base, expect, type Page } from '@playwright/test'
import type { TestArray } from './array'
import { API_URL } from './env'

const SELECTED_CONFIG_KEY = 'snapraid-ui:selected-config'

export interface App {
  api: APIRequestContext
  // Adds the array to SnapRAID UI and makes it the one the browser shows
  addArray: (array: TestArray, name?: string) => Promise<void>
  // Waits for the toast of a job that finished successfully, by the command's label (Sync, Undelete…)
  expectFinished: (label: string) => Promise<void>
  // Waits until no SnapRAID job runs
  waitForIdle: (timeoutMs?: number) => Promise<void>
}

/**
 * Waits until the health tile of the dashboard shows the text (All good, Errors found…)
 */
export const expectHealth = (page: Page, text: string, timeout?: number) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible({ timeout })

const api = (path: string) => `${API_URL}${path}`

export const test = base.extend<{ app: App }>({
  app: async ({ page, request }, use) => {
    const added: string[] = []

    const waitForIdle = async (timeoutMs = 90_000) => {
      await expect
        .poll(async () => (await request.get(api('/snapraid/current-job'))).json(), {
          timeout: timeoutMs,
          intervals: [250],
        })
        .toBeNull()
    }

    const app: App = {
      api: request,
      addArray: async (array, name = array.name) => {
        const response = await request.post(api('/config/add'), { data: { name, path: array.storedPath } })
        expect(response.ok(), await response.text()).toBe(true)
        added.push(array.storedPath)
        await page.addInitScript(
          ([key, path]) => localStorage.setItem(key, path),
          [SELECTED_CONFIG_KEY, array.storedPath],
        )
      },
      expectFinished: async (label) => {
        await expect(page.getByText(`"${label}" finished successfully`)).toBeVisible({ timeout: 90_000 })
        await waitForIdle()
      },
      waitForIdle,
    }

    await use(app)

    await waitForIdle()
    const schedules: { id: string }[] = await (await request.get(api('/schedules'))).json()
    for (const { id } of schedules) await request.delete(api(`/schedules/${id}`))
    for (const path of added) await request.post(api('/config/remove'), { data: { path } })
  },
})

export { expect }
