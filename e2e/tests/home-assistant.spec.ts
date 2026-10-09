// Home Assistant over MQTT: discovery, state and the buttons, against a broker in the test
import { createServer } from 'node:net'
import Aedes from 'aedes'
import mqtt from 'mqtt'
import { createArray } from '../harness/array'
import { API_URL, PORTS } from '../harness/env'
import { expect, expectHealth, test } from '../harness/fixtures'

const startBroker = async () => {
  const broker = new Aedes()
  const server = createServer(broker.handle)
  await new Promise<void>((resolve) => server.listen(PORTS.mqtt, '127.0.0.1', resolve))
  return {
    close: async () => {
      await new Promise<void>((resolve) => broker.close(() => resolve()))
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

test('arrays show up in Home Assistant, and its buttons run jobs', async ({ page, app }) => {
  const broker = await startBroker()
  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${PORTS.mqtt}`)
  const retained = new Map<string, string>()
  client.on('message', (topic, payload) => retained.set(topic, payload.toString()))
  await client.subscribeAsync(['homeassistant/#', 'snapraid-ui/#'])
  const state = () => JSON.parse(retained.get('snapraid-ui/home_assistant/state') ?? '{}')

  try {
    const array = await createArray('home-assistant')
    await app.addArray(array, 'Home Assistant')
    // The dashboard reads the status, Home Assistant gets its health
    await page.goto('/')
    await expectHealth(page, 'All good')

    await page.goto('/automation')
    await page.getByRole('switch', { name: 'Home Assistant' }).click()
    await page.getByLabel('MQTT broker').fill(`mqtt://127.0.0.1:${PORTS.mqtt}`)
    await page.getByRole('button', { name: 'Test connection' }).click()
    await expect(page.getByText('Connected to the broker')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 })

    await expect.poll(() => retained.get('snapraid-ui/status')).toBe('online')
    await expect.poll(() => state().health).toBe('ok')
    const health = JSON.parse(retained.get('homeassistant/sensor/snapraid_ui_home_assistant/health/config') ?? '{}')
    expect(health).toMatchObject({
      state_topic: 'snapraid-ui/home_assistant/state',
      unique_id: 'snapraid_ui_home_assistant_health',
      device: { name: 'SnapRAID Home Assistant' },
    })
    expect(retained.has('homeassistant/button/snapraid_ui_home_assistant/scrub/config')).toBe(true)
    expect(state().last_scrub).toBeNull()

    // The Scrub button of Home Assistant
    await client.publishAsync('snapraid-ui/home_assistant/command', 'scrub')
    await expect.poll(() => state().last_scrub, { timeout: 60_000 }).not.toBeNull()
    expect(state().last_scrub_ok).toBe(true)

    // Sync, through the sync guard
    await array.writeFile('d1', 'photos/new.jpg', 50)
    await app.waitForIdle()
    await client.publishAsync('snapraid-ui/home_assistant/command', 'sync')
    await expect.poll(() => state().last_sync, { timeout: 60_000 }).not.toBeNull()
    await app.waitForIdle()
    expect(await array.snapraid('diff')).toMatch(/No differences/)
  } finally {
    await app.api.put(`${API_URL}/home-assistant`, { data: { enabled: false } })
    await client.endAsync()
    await broker.close()
  }
})
