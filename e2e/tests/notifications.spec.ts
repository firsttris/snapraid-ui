// Notifications leave SnapRAID UI: a webhook receiver on the test machine gets them
import { rm } from 'node:fs/promises'
import http from 'node:http'
import { join } from 'node:path'
import { createArray } from '../harness/array'
import { API_URL, PORTS } from '../harness/env'
import { expect, test } from '../harness/fixtures'

interface WebhookPayload {
  event: string
  severity: string
  title: string
  message: string
}

const startReceiver = async () => {
  const received: WebhookPayload[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push(JSON.parse(body))
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(PORTS.webhook, '127.0.0.1', resolve))
  return { received, close: () => new Promise((resolve) => server.close(resolve)) }
}

test('a failed scheduled job is reported to the webhook', async ({ page, app }) => {
  const receiver = await startReceiver()
  const defaults = await (await app.api.get(`${API_URL}/notifications`)).json()
  try {
    const array = await createArray('notify')
    await app.addArray(array, 'Notify')

    await page.goto('/notifications')
    await page.getByRole('switch', { name: /^Webhook/ }).click()
    await page.getByLabel('URL').fill(`http://127.0.0.1:${PORTS.webhook}/hook`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Notification settings saved')).toBeVisible()

    await page.getByRole('button', { name: 'Send test' }).click()
    await expect(page.getByText('Test notification sent')).toBeVisible()
    expect(receiver.received).toHaveLength(1)

    // Without its parity disk the sync fails
    await rm(join(array.dir, 'parity'), { recursive: true })
    const created = await app.api.post(`${API_URL}/schedules`, {
      data: { name: 'Nightly sync', command: 'sync', configPath: array.storedPath, cronExpression: '0 2 * * *' },
    })
    const { id } = await created.json()
    await app.api.post(`${API_URL}/schedules/${id}/run`)

    await expect.poll(() => receiver.received.length, { timeout: 60_000 }).toBe(2)
    expect(receiver.received[1]).toMatchObject({ event: 'job_failed', severity: 'error' })
    expect(receiver.received[1].title).toBe('Failed: Nightly sync')
  } finally {
    await app.api.put(`${API_URL}/notifications`, { data: defaults })
    await receiver.close()
  }
})
