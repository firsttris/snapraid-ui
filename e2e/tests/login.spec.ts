// The built-in login: changing the password and passkeys, on a second backend with
// SNAPRAID_UI_USERNAME and SNAPRAID_UI_PASSWORD set. Passkeys need a secure context with a host
// name: the tests open http://localhost, with Chromium's virtual authenticator (fingerprint always
// accepted), and 127.0.0.1 to see that they are off there.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { IMAGE, PORTS, RUN_DIR, SNAPRAID } from '../harness/env'
import { startBackend } from '../harness/global-setup'
import type { Server } from '../harness/servers'

const BASE = `http://localhost:${PORTS.login}`
const PASSWORD = 'the-password-from-the-env'
const NEW_PASSWORD = 'a-new-long-password'

test.skip(!!IMAGE, 'Starts a backend of its own, from the sources or the binary')

let server: Server | undefined

test.beforeAll(async () => {
  const base = join(RUN_DIR, 'login')
  await rm(base, { recursive: true, force: true })
  await mkdir(join(base, 'logs'), { recursive: true })
  await writeFile(
    join(base, 'config.json'),
    JSON.stringify({
      version: '1.0.0',
      snapraidConfigs: [],
      logs: { maxHistoryEntries: 50, directory: 'logs', maxFiles: 100, maxAge: 30 },
    }),
  )
  server = await startBackend(
    {
      SNAPRAID_BASE_PATH: base,
      SNAPRAID_BIN: SNAPRAID,
      SNAPRAID_UI_USERNAME: 'admin',
      SNAPRAID_UI_PASSWORD: PASSWORD,
    },
    { name: 'backend-login', port: PORTS.login },
  )
})

test.afterAll(async () => {
  await server?.stop()
})

const virtualAuthenticator = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

const signIn = async (page: Page, password: string) => {
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
}

const openSignIn = async (page: Page) => {
  await page.getByRole('button', { name: 'Sign-in' }).click()
  return page.getByRole('dialog', { name: 'Sign-in' })
}

test('the password changes in the UI, a passkey signs in, is renamed and deleted', async ({ page }) => {
  await virtualAuthenticator(page)
  await page.goto(BASE)
  // No passkey yet: only the password
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeHidden()
  await signIn(page, PASSWORD)

  let dialog = await openSignIn(page)
  await dialog.getByLabel('Current password').fill('wrong-password')
  await dialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await dialog.getByLabel('Repeat new password').fill(NEW_PASSWORD)
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog.getByText('The password is incorrect')).toBeVisible()
  await dialog.getByLabel('Current password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Password changed. Other browsers are signed out.')).toBeVisible()

  await expect(dialog.getByText('No passkey set up yet.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add passkey' }).click()
  await dialog.getByLabel('Name').fill('Laptop')
  // The old password is gone, the new one confirms
  await dialog.getByLabel('Password to confirm').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create passkey' }).click()
  await expect(dialog.getByText('The password is incorrect')).toBeVisible()
  await dialog.getByLabel('Password to confirm').fill(NEW_PASSWORD)
  await dialog.getByRole('button', { name: 'Create passkey' }).click()
  const passkey = dialog.getByRole('listitem')
  await expect(passkey).toHaveCount(1)
  await expect(passkey).toContainText('Laptop')
  await expect(passkey).toContainText('for localhost')
  await expect(passkey).toContainText('last used never')
  await page.keyboard.press('Escape')

  await signOut(page)
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

  dialog = await openSignIn(page)
  await expect(passkey).not.toContainText('last used never')
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Work laptop')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(passkey).toContainText('Work laptop')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(dialog.getByText('No passkey set up yet.')).toBeVisible()
  await page.keyboard.press('Escape')

  // Only the new password signs in now
  await signOut(page)
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeHidden()
  await signIn(page, PASSWORD)
  await expect(page.getByText('Username or password is incorrect')).toBeVisible()
  await signIn(page, NEW_PASSWORD)
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
})

// After the test above, with its new password
test('on an IP address the dialog says why passkeys are off', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORTS.login}`)
  await signIn(page, NEW_PASSWORD)
  const dialog = await openSignIn(page)
  await expect(dialog).toContainText('This page is open over http:// or an IP address.')
  await expect(dialog.getByRole('button', { name: 'Add passkey' })).toBeDisabled()
})
