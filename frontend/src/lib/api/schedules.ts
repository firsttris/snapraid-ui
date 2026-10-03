import type { Schedule } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

export const schedulesApi = {
  getAll: async (): Promise<Schedule[]> => {
    const res = await apiFetch(`${API_BASE}/schedules`)
    if (!res.ok) throw await apiError(res)
    return res.json()
  },

  getById: async (id: string): Promise<Schedule> => {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`)
    if (!res.ok) throw await apiError(res)
    return res.json()
  },

  create: async (
    schedule: Omit<
      Schedule,
      'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'
    >,
  ): Promise<Schedule> => {
    const res = await apiFetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    })
    if (!res.ok) {
      throw await apiError(res)
    }
    return res.json()
  },

  update: async (
    id: string,
    updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>,
  ): Promise<Schedule> => {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      throw await apiError(res)
    }
    return res.json()
  },

  delete: async (id: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw await apiError(res)
    }
  },

  toggle: async (id: string): Promise<Schedule> => {
    const res = await apiFetch(`${API_BASE}/schedules/${id}/toggle`, {
      method: 'POST',
    })
    if (!res.ok) {
      throw await apiError(res)
    }
    return res.json()
  },

  getNextRuns: async (): Promise<Record<string, string | null>> => {
    const res = await apiFetch(`${API_BASE}/schedules/next-runs`)
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
}
