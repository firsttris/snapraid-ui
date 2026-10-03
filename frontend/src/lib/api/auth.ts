import type { AuthSession } from '@shared/types'
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

/**
 * Log in, the backend sets the session cookie
 */
export const login = async (
  username: string,
  password: string,
): Promise<LoginResult> => {
  const response = await apiFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
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
 * Log out, the backend clears the session cookie
 */
export const logout = async (): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
  })
  if (!response.ok) throw await apiError(response)
}
