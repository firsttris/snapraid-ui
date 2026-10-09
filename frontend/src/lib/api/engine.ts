import type { DaemonCheck, DaemonTarget, EngineSettings } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

// The saved settings and the engine that runs right now
export type EngineState = EngineSettings & { active: 'cli' | 'daemon' }

export const engineApi = {
  get: async (): Promise<EngineState> => {
    const response = await apiFetch(`${API_BASE}/engine`)
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  save: async (settings: EngineSettings): Promise<EngineState> => {
    const response = await apiFetch(`${API_BASE}/engine`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  // Connects to one daemon as entered, before it is saved
  test: async (target: DaemonTarget): Promise<DaemonCheck> => {
    const response = await apiFetch(`${API_BASE}/engine/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },
}
