import type { ParsedSnapRaidConfig, SnapRaidCommand, CommandOutput, RunningJob, SmartReport, ProbeReport, DevicesReport, ListReport, CheckReport, DiffReport } from "@shared/types";
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

/**
 * Set pool directory in SnapRAID config
 */
export const setPool = async (configPath: string, poolPath: string | undefined): Promise<ParsedSnapRaidConfig> => {
  const response = await fetch(`${API_BASE}/api/snapraid/set-pool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, poolPath }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to set pool directory');
  }
  const result = await response.json();
  return result.config;
}

/**
 * Get SMART report for all disks
 */
export const getSmart = async (configPath: string): Promise<SmartReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/smart?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get SMART report');
  }
  return response.json();
}

/**
 * Get power status of all disks (probe)
 */
export const probe = async (configPath: string): Promise<ProbeReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/probe?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to probe disk status');
  }
  return response.json();
}

/**
 * Spin up disks
 */
export const spinUp = async (configPath: string, disks?: string[]): Promise<{ success: boolean; message: string; output: string }> => {
  const response = await fetch(`${API_BASE}/api/snapraid/up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, disks }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to spin up disks');
  }
  return response.json();
}

/**
 * Spin down disks
 */
export const spinDown = async (configPath: string, disks?: string[]): Promise<{ success: boolean; message: string; output: string }> => {
  const response = await fetch(`${API_BASE}/api/snapraid/down`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, disks }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to spin down disks');
  }
  return response.json();
}

/**
 * Get device information
 */
export const getDevices = async (configPath: string): Promise<DevicesReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/devices?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get device information');
  }
  return response.json();
}

/**
 * Get file list from SnapRAID
 */
export const getFileList = async (configPath: string): Promise<ListReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/list?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get file list');
  }
  return response.json();
}

/**
 * Get check report from SnapRAID
 */
export const getCheck = async (configPath: string): Promise<CheckReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/check?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get check report');
  }
  return response.json();
}

/**
 * Get diff report from SnapRAID
 */
export const getDiff = async (configPath: string): Promise<DiffReport> => {
  const response = await fetch(`${API_BASE}/api/snapraid/diff?path=${encodeURIComponent(configPath)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get diff report');
  }
  return response.json();
}
