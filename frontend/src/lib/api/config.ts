import type { AppConfig, ConfigFileCheck } from '@shared/types'
import { API_BASE, apiFetch } from './constants'

/**
 * Get app configuration
 */
export const getConfig = async (): Promise<AppConfig> => {
  const response = await apiFetch(`${API_BASE}/config`)
  if (!response.ok) throw new Error('Failed to fetch config')
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
  if (!response.ok) throw new Error('Failed to save config')
}

const errorFrom = async (response: Response, fallback: string) => {
  const error = await response.json().catch(() => ({}))
  return new Error(error.error || fallback)
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
  if (!response.ok) throw await errorFrom(response, 'Failed to add config')
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
  if (!response.ok) throw new Error('Failed to remove config')
  const result = await response.json()
  return result.config
}

/**
 * Create a new SnapRAID config file from a template and add it
 */
export const createConfig = async (
  name: string,
  fileName: string,
): Promise<{ config: AppConfig; path: string }> => {
  const response = await apiFetch(`${API_BASE}/config/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, fileName }),
  })
  if (!response.ok) throw await errorFrom(response, 'Failed to create config')
  return response.json()
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
  if (!response.ok) throw await errorFrom(response, 'Failed to update config')
  const result = await response.json()
  return result.config
}

/**
 * Whether each config file exists and what it contains
 */
export const checkConfigs = async (): Promise<ConfigFileCheck[]> => {
  const response = await apiFetch(`${API_BASE}/config/check`)
  if (!response.ok) throw new Error('Failed to check configs')
  return response.json()
}

/**
 * Directory relative config paths are resolved against
 */
export const getBasePath = async (): Promise<string> => {
  const response = await apiFetch(`${API_BASE}/config/base-path`)
  if (!response.ok) throw new Error('Failed to fetch base path')
  const result = await response.json()
  return result.basePath
}
