import type { ParsedSnapRaidConfig, SnapRaidCommand, CommandOutput, RunningJob } from "@shared/types";
import { API_BASE } from "./constants";

/**
 * Parse a SnapRAID config file
 */
export const parseSnapRaidConfig = async (path: string): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/parse?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error('Failed to parse config');
  return response.json();
}

/**
 * Execute a SnapRAID command
 */
export const executeCommand = async (command: SnapRaidCommand, configPath: string, args: string[] = []): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/snapraid/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, configPath, args }),
  });
  if (!response.ok) throw new Error('Failed to execute command');
}

/**
 * Get command history
 */
export const getHistory = async (): Promise<CommandOutput[]> => {
  const response = await fetch(`${API_BASE}/api/history`);
  if (!response.ok) throw new Error('Failed to fetch history');
  return response.json();
}

/**
 * Get current running job
 */
export const getCurrentJob = async (): Promise<RunningJob | null> => {
  const response = await fetch(`${API_BASE}/api/snapraid/current-job`);
  if (!response.ok) throw new Error('Failed to fetch current job');
  return response.json();
}

/**
 * Validate SnapRAID config
 */
export const validateConfig = async (configPath: string): Promise<{ valid: boolean; exitCode: number; output: string }> => {
  const response = await fetch(`${API_BASE}/api/snapraid/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath }),
  });
  if (!response.ok) throw new Error('Failed to validate config');
  return response.json();
}

/**
 * Add a data disk to SnapRAID config
 */
export const addDataDisk = async (configPath: string, diskName: string, diskPath: string): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/add-data-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskName, diskPath }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add data disk');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Add a parity disk to SnapRAID config
 */
export const addParityDisk = async (configPath: string, parityPath: string): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/add-parity-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, parityPath }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add parity disk');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Remove a disk from SnapRAID config
 */
export const removeDisk = async (configPath: string, diskName: string | null, diskType: 'data' | 'parity'): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/remove-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskName, diskType }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove disk');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Add an exclude pattern to SnapRAID config
 */
export const addExclude = async (configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/add-exclude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, pattern }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add exclude pattern');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Remove an exclude pattern from SnapRAID config
 */
export const removeExclude = async (configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/remove-exclude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, pattern }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove exclude pattern');
  }
  const result = await response.json();
  return result.config;
}
