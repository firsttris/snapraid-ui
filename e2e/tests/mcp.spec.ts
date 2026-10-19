// AI agents over MCP: the endpoint switched on in the UI, refused without the token, and an
// agent's calls answered from the real array, the shipped documentation and a sync it starts
import { createArray } from '../harness/array'
import { API_URL } from '../harness/env'
import { expect, test } from '../harness/fixtures'

const rpc = async (token: string, method: string, params: object = {}) => {
  const response = await fetch(`${API_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).result
}

const callTool = async (token: string, name: string, args: object = {}) => {
  const result = await rpc(token, 'tools/call', { name, arguments: args })
  return { isError: result.isError === true, text: result.content[0].text as string }
}

test('an agent reads the array and the documentation and starts a sync', async ({ page, app }) => {
  const defaults = await (await app.api.get(`${API_URL}/maintenance`)).json()
  try {
    const array = await createArray('mcp')
    await app.addArray(array, 'MCP')
    // The dashboard reads the status, the overview reports it
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: 'All good' })).toBeVisible()

    expect((await fetch(`${API_URL}/mcp`, { method: 'POST' })).status).toBe(404)

    await page.goto('/automation')
    await page.getByRole('switch', { name: 'AI agent (MCP)' }).click()
    const token = await page.locator('#mcp-token').inputValue()
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    await expect(page.getByText(`claude mcp add -s user --transport http snapraid`)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    // Not behind the login, but never without the token
    expect((await fetch(`${API_URL}/mcp`, { method: 'POST' })).status).toBe(401)

    const { serverInfo } = await rpc(token, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1' },
    })
    expect(serverInfo.name).toBe('snapraid-ui')

    const overview = JSON.parse((await callTool(token, 'get_overview', { array: 'MCP' })).text)
    expect(overview.arrays[0]).toMatchObject({ name: 'MCP', health: 'ok', bad_blocks: 0 })

    // The documentation ships with the backend, also in the image
    const pages = JSON.parse((await callTool(token, 'read_documentation')).text)
    expect(pages.map((p: { page: string }) => p.page)).toContain('disks')
    expect((await callTool(token, 'read_documentation', { page: 'disks' })).text).toContain(
      '# Configurations and disks',
    )

    const started = new Date().toISOString()
    expect(await callTool(token, 'start_job', { array: 'MCP', command: 'sync' })).toMatchObject({ isError: false })
    // The last job of an earlier test does not count
    await expect
      .poll(
        async () => {
          const { lastFinished } = JSON.parse((await callTool(token, 'get_job')).text)
          return lastFinished && lastFinished.finishedAt >= started ? lastFinished : null
        },
        { timeout: 60_000 },
      )
      .toMatchObject({ command: 'sync', exitCode: 0 })

    // Read only: the actions are gone
    await page.getByLabel('Allow actions').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()
    const { tools } = await rpc(token, 'tools/list')
    const names = tools.map((tool: { name: string }) => tool.name)
    expect(names).toContain('get_overview')
    expect(names).not.toContain('start_job')
  } finally {
    await app.api.put(`${API_URL}/maintenance`, { data: defaults })
  }
})
