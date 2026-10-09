// Monitoring from outside: the heartbeat ping and the Prometheus metrics
import http from 'node:http'
import { createArray } from '../harness/array'
import { API_URL, PORTS } from '../harness/env'
import { expect, test } from '../harness/fixtures'

const startReceiver = async () => {
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.end('OK')
  })
  await new Promise<void>((resolve) => server.listen(PORTS.webhook, '127.0.0.1', resolve))
  return { requests, close: () => new Promise((resolve) => server.close(resolve)) }
}

test('the heartbeat is pinged after a successful scheduled run', async ({ page, app }) => {
  const receiver = await startReceiver()
  const defaults = await (await app.api.get(`${API_URL}/notifications`)).json()
  try {
    const array = await createArray('heartbeat')
    await app.addArray(array, 'Heartbeat')

    await page.goto('/notifications')
    await page.getByRole('switch', { name: /^Heartbeat/ }).click()
    await page.getByLabel('URL').fill(`http://127.0.0.1:${PORTS.webhook}/ping/nightly`)
    await page.getByRole('button', { name: 'Send ping' }).click()
    await expect(page.getByText('Ping sent')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Notification settings saved')).toBeVisible()
    expect(receiver.requests).toEqual(['GET /ping/nightly'])

    const created = await app.api.post(`${API_URL}/schedules`, {
      data: { name: 'Nightly sync', command: 'sync', configPath: array.storedPath, cronExpression: '0 2 * * *' },
    })
    const { id } = await created.json()
    await app.api.post(`${API_URL}/schedules/${id}/run`)
    await expect.poll(() => receiver.requests.length, { timeout: 60_000 }).toBe(2)
  } finally {
    await app.api.put(`${API_URL}/notifications`, { data: defaults })
    await receiver.close()
  }
})

test('Prometheus metrics need the token and describe the array', async ({ page, app }) => {
  const defaults = await (await app.api.get(`${API_URL}/maintenance`)).json()
  try {
    const array = await createArray('metrics')
    await app.addArray(array, 'Metrics')
    // The dashboard reads the status, the metrics report its values
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: 'All good' })).toBeVisible()

    expect((await fetch(`${API_URL}/metrics`)).status).toBe(404)

    await page.goto('/automation')
    await page.getByRole('switch', { name: 'Prometheus metrics' }).click()
    const token = await page.getByLabel('Access token').inputValue()
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    await expect(page.getByText(`credentials: ${token}`)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    // Open to scrapers without a session, but not without the token
    expect((await fetch(`${API_URL}/metrics`)).status).toBe(401)
    const response = await fetch(`${API_URL}/metrics`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    const text = await response.text()
    expect(text).toContain('snapraid_ui_up 1')
    expect(text).toContain('snapraid_bad_blocks{config="Metrics"} 0')
    expect(text).toMatch(/snapraid_disk_used_bytes\{config="Metrics",disk="d1"\} \d+/)
  } finally {
    await app.api.put(`${API_URL}/maintenance`, { data: defaults })
  }
})
