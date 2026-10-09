import type { ArraySetup } from '@shared/array-setup'
import type { MountCandidate } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

export const setupApi = {
  mounts: async (): Promise<MountCandidate[]> => {
    const response = await apiFetch(`${API_BASE}/setup/mounts`)
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  create: async (
    name: string,
    fileName: string,
    setup: ArraySetup,
  ): Promise<{ path: string }> => {
    const response = await apiFetch(`${API_BASE}/setup/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fileName, setup }),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },
}
