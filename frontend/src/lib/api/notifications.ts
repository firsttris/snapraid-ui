import type {
  NotificationChannel,
  NotificationSettings,
  NotificationTestResult,
} from '@shared/types'
import { API_BASE, apiFetch } from './constants'

const failed = async (response: Response, fallback: string) => {
  const error = await response.json().catch(() => ({}))
  return new Error(error.error || fallback)
}

export const notificationsApi = {
  get: async (): Promise<NotificationSettings> => {
    const response = await apiFetch(`${API_BASE}/notifications`)
    if (!response.ok)
      throw await failed(response, 'Failed to load notification settings')
    return response.json()
  },

  save: async (
    settings: NotificationSettings,
  ): Promise<NotificationSettings> => {
    const response = await apiFetch(`${API_BASE}/notifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok)
      throw await failed(response, 'Failed to save notification settings')
    return response.json()
  },

  // Sends with the settings as entered, before they are saved
  test: async (
    settings: NotificationSettings,
    channel?: NotificationChannel,
  ): Promise<NotificationTestResult[]> => {
    const response = await apiFetch(`${API_BASE}/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, channel }),
    })
    if (!response.ok)
      throw await failed(response, 'Failed to send test notification')
    return response.json()
  },
}
