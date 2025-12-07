import { API_BASE } from './constants'
import type { Schedule } from '@shared/types'

export const schedulesApi = {
  getAll: async (): Promise<Schedule[]> => {
    const res = await fetch(`${API_BASE}/schedules`)
    if (!res.ok) throw new Error('Failed to fetch schedules')
    return res.json()
  },

  getById: async (id: string): Promise<Schedule> => {
    const res = await fetch(`${API_BASE}/schedules/${id}`)
    if (!res.ok) throw new Error('Failed to fetch schedule')
    return res.json()
  },

  create: async (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>): Promise<Schedule> => {
    const res = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to create schedule')
    }
    return res.json()
  },

  update: async (id: string, updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>): Promise<Schedule> => {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to update schedule')
    }
    return res.json()
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to delete schedule')
    }
  },

  toggle: async (id: string): Promise<Schedule> => {
    const res = await fetch(`${API_BASE}/schedules/${id}/toggle`, {
      method: 'POST',
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to toggle schedule')
    }
    return res.json()
  },

  getNextRuns: async (): Promise<Record<string, string | null>> => {
    const res = await fetch(`${API_BASE}/schedules/next-runs`)
    if (!res.ok) throw new Error('Failed to fetch next runs')
    return res.json()
  },
}
