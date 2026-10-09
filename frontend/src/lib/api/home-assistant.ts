import type { HomeAssistantSettings, HomeAssistantStatus } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

export interface HomeAssistantState {
  settings: HomeAssistantSettings
  status: HomeAssistantStatus
}

export const homeAssistantApi = {
  get: async (): Promise<HomeAssistantState> => {
    const response = await apiFetch(`${API_BASE}/home-assistant`)
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  save: async (
    settings: HomeAssistantSettings,
  ): Promise<HomeAssistantState> => {
    const response = await apiFetch(`${API_BASE}/home-assistant`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  // Connects with the settings as entered, before they are saved
  test: async (
    settings: HomeAssistantSettings,
  ): Promise<{ ok: boolean; error?: string }> => {
    const response = await apiFetch(`${API_BASE}/home-assistant/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },
}
