// vite proxy not forwards POST request bodys correctly, using localhost directly for dev
export const API_BASE = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:8080/api'
export const WS_URL = import.meta.env.PROD ? '/ws' : 'ws://localhost:8080/ws'

// Fired when the backend rejects a request because the session is missing or expired
export const UNAUTHORIZED_EVENT = 'snapraid:unauthorized'

/**
 * fetch with the session cookie; the dev frontend runs on another port than the API
 */
export const apiFetch = async (
  input: string,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(input, { credentials: 'include', ...init })
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  return response
}
