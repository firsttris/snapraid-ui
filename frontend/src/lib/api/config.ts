import type { AppConfig } from "@shared/types";
import { API_BASE } from "./constants";

/**
 * Get app configuration
 */
export const getConfig = async (): Promise<AppConfig> => {
  const response = await fetch(`${API_BASE}/config`);
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
}

/**
 * Save app configuration
 */
export const saveConfig = async (config: AppConfig): Promise<void> => {
  const response = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error('Failed to save config');
}

/**
 * Add a new SnapRAID config
 */
export const addConfig = async (name: string, path: string, enabled: boolean = true): Promise<AppConfig> => {
  const response = await fetch(`${API_BASE}/config/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path: path.replace(/^.*[\/\\]/, ''), enabled }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add config');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Remove a SnapRAID config
 */
export const removeConfig = async (path: string): Promise<AppConfig> => {
  const response = await fetch(`${API_BASE}/config/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error('Failed to remove config');
  const result = await response.json();
  return result.config;
}
