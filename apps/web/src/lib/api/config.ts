import type { AppConfig, ConfigFileCheck } from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

/**
 * Get app configuration
 */
export const getConfig = async (): Promise<AppConfig> => {
  const response = await apiFetch(`${API_BASE}/config`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Save app configuration
 */
export const saveConfig = async (config: AppConfig): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!response.ok) throw await apiError(response)
}

/**
 * Add an existing SnapRAID config file
 */
export const addConfig = async (
  name: string,
  path: string,
  enabled: boolean = true,
): Promise<AppConfig> => {
  const response = await apiFetch(`${API_BASE}/config/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path, enabled }),
  })
  if (!response.ok) throw await apiError(response)
  const result = await response.json()
  return result.config
}

/**
 * Remove a SnapRAID config
 */
export const removeConfig = async (path: string): Promise<AppConfig> => {
  const response = await apiFetch(`${API_BASE}/config/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) throw await apiError(response)
  const result = await response.json()
  return result.config
}

/**
 * Rename or enable/disable a SnapRAID config
 */
export const updateConfig = async (
  path: string,
  changes: { name?: string; enabled?: boolean },
): Promise<AppConfig> => {
  const response = await apiFetch(`${API_BASE}/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ...changes }),
  })
  if (!response.ok) throw await apiError(response)
  const result = await response.json()
  return result.config
}

/**
 * Whether each config file exists and what it contains
 */
export const checkConfigs = async (): Promise<ConfigFileCheck[]> => {
  const response = await apiFetch(`${API_BASE}/config/check`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Directory relative config paths are resolved against
 */
export const getBasePath = async (): Promise<string> => {
  const response = await apiFetch(`${API_BASE}/config/base-path`)
  if (!response.ok) throw await apiError(response)
  const result = await response.json()
  return result.basePath
}

/**
 * Settings, histories and SnapRAID configs as one file
 */
export const downloadBackup = async (): Promise<{
  blob: Blob
  filename: string
}> => {
  const response = await apiFetch(`${API_BASE}/config/backup`)
  if (!response.ok) throw await apiError(response)
  const filename =
    response.headers
      .get('Content-Disposition')
      ?.match(/filename="([^"]+)"/)?.[1] ?? 'snapraid-ui-backup.json'
  return { blob: await response.blob(), filename }
}

/**
 * Write a backup back, the server checks its content
 */
export const restoreBackup = async (
  content: string,
): Promise<{ restored: string[]; skipped: string[] }> => {
  const response = await apiFetch(`${API_BASE}/config/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })
  if (!response.ok) throw await apiError(response)
  return response.json()
}
