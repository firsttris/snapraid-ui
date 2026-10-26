import type { AuthSession, PasskeyInfo } from '@shared/types'
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfter: number }

/**
 * Get the current login state
 */
export const getSession = async (): Promise<AuthSession> => {
  const response = await apiFetch(`${API_BASE}/auth/session`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

// What a login request answered: the session, wrong credentials or the lockout
const loginResult = async (response: Response): Promise<LoginResult> => {
  if (response.ok) return { ok: true, session: await response.json() }
  if (response.status === 401) return { ok: false, reason: 'invalid' }
  if (response.status === 429) {
    const body = await response.json().catch(() => ({}))
    return {
      ok: false,
      reason: 'locked',
      retryAfter: Number(body.retryAfter) || 60,
    }
  }
  throw await apiError(response)
}

/**
 * Log in, the backend sets the session cookie
 */
export const login = async (
  username: string,
  password: string,
): Promise<LoginResult> =>
  loginResult(
    await apiFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  )

/**
 * Log out, the backend clears the session cookie
 */
export const logout = async (): Promise<AuthSession> => {
  const response = await apiFetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
  })
  if (!response.ok) throw await apiError(response)
  return response.json()
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await apiFetch(`${API_BASE}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * A new password after the current one; the backend ends the other sessions
 */
export const changePassword = async (
  current: string,
  next: string,
): Promise<void> => {
  await post('/password', { current, next })
}

/**
 * Whether passkeys can work on this page: WebAuthn needs a secure context
 * (HTTPS or localhost) and a host name, not an IP address. The backend checks
 * the same.
 */
export const passkeysSupported = (): boolean => {
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    !window.PublicKeyCredential
  )
    return false
  const host = window.location.hostname
  return (
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
    !host.includes(':') &&
    !host.startsWith('[')
  )
}

/**
 * True when the user closed the browser's passkey dialog or it timed out
 */
export const passkeyCancelled = (error: unknown): boolean => {
  const cause =
    error instanceof WebAuthnError
      ? ((error.cause as Error | undefined) ?? error)
      : (error as Error | undefined)
  return cause?.name === 'NotAllowedError' || cause?.name === 'AbortError'
}

/**
 * Log in with a passkey the browser offers for this host
 */
export const loginWithPasskey = async (): Promise<LoginResult> => {
  const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>(
    '/passkey/options',
    {},
  )
  const response = await startAuthentication({ optionsJSON })
  return loginResult(
    await apiFetch(`${API_BASE}/auth/passkey/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    }),
  )
}

export const listPasskeys = async (): Promise<PasskeyInfo[]> => {
  const response = await apiFetch(`${API_BASE}/auth/passkeys`)
  if (!response.ok) throw await apiError(response)
  return (await response.json()).passkeys
}

/**
 * Make a passkey for this host; asks for the password once more
 */
export const createPasskey = async (
  name: string,
  password: string,
): Promise<void> => {
  const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>(
    '/passkeys/options',
    { password },
  )
  const response = await startRegistration({ optionsJSON })
  await post('/passkeys', { response, name })
}

export const renamePasskey = async (
  id: string,
  name: string,
): Promise<void> => {
  const response = await apiFetch(
    `${API_BASE}/auth/passkeys/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  )
  if (!response.ok) throw await apiError(response)
}

export const deletePasskey = async (id: string): Promise<void> => {
  const response = await apiFetch(
    `${API_BASE}/auth/passkeys/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw await apiError(response)
}
