import type { LogFile } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

/**
 * Get all log files
 */
export const getLogs = async (): Promise<LogFile[]> => {
  const response = await apiFetch(`${API_BASE}/logs`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Get log file content
 */
export const getLogContent = async (filename: string): Promise<string> => {
  const response = await apiFetch(
    `${API_BASE}/logs/${encodeURIComponent(filename)}`,
  )
  if (!response.ok) throw await apiError(response)
  return response.text()
}

/**
 * Delete a log file
 */
export const deleteLog = async (filename: string): Promise<void> => {
  const response = await apiFetch(
    `${API_BASE}/logs/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
    },
  )
  if (!response.ok) throw await apiError(response)
}

/**
 * Trigger log rotation
 */
export const rotateLogs = async (): Promise<{ deleted: number }> => {
  const response = await apiFetch(`${API_BASE}/logs/rotate`, {
    method: 'POST',
  })
  if (!response.ok) throw await apiError(response)
  return response.json()
}
