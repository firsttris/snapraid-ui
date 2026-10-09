import type {
  DockerContainersReport,
  MaintenanceSettings,
  SpindownStatus,
} from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

export const maintenanceApi = {
  get: async (): Promise<MaintenanceSettings> => {
    const response = await apiFetch(`${API_BASE}/maintenance`)
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  save: async (settings: MaintenanceSettings): Promise<MaintenanceSettings> => {
    const response = await apiFetch(`${API_BASE}/maintenance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  // Containers on the socket as entered, before it is saved
  containers: async (socketPath: string): Promise<DockerContainersReport> => {
    const query = new URLSearchParams({ socket: socketPath })
    const response = await apiFetch(
      `${API_BASE}/maintenance/containers?${query}`,
    )
    if (!response.ok) throw await apiError(response)
    return response.json()
  },

  spindown: async (): Promise<SpindownStatus> => {
    const response = await apiFetch(`${API_BASE}/maintenance/spindown`)
    if (!response.ok) throw await apiError(response)
    return response.json()
  },
}
