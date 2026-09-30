import type {
  CheckReport,
  CommandOutput,
  DevicesReport,
  DiffReport,
  DiskReplacement,
  DupReport,
  LastRuns,
  ListReport,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
  ProbeReport,
  ReplacementStep,
  RunningJob,
  SmartReport,
  SnapRaidCommand,
  SnapRaidStatus,
} from '@shared/types'
import { API_BASE, apiFetch } from './constants'

/**
 * Parse a SnapRAID config file
 */
export const parseSnapRaidConfig = async (
  path: string,
): Promise<ParsedSnapRaidConfig> => {
  const relativePath = path.replace(/^.*[/\\]/, '')
  const response = await apiFetch(
    `${API_BASE}/snapraid/parse?path=${encodeURIComponent(relativePath)}`,
  )
  if (!response.ok) throw new Error('Failed to parse config')
  return response.json()
}

/**
 * Execute a SnapRAID command
 */
export const executeCommand = async (
  command: SnapRaidCommand,
  configPath: string,
  args: string[] = [],
): Promise<void> => {
  const relativePath = configPath.replace(/^.*[/\\]/, '')
  const response = await apiFetch(`${API_BASE}/snapraid/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, configPath: relativePath, args }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to execute command')
  }
}

/**
 * Get command history
 */
export const getHistory = async (): Promise<CommandOutput[]> => {
  const response = await apiFetch(`${API_BASE}/history`)
  if (!response.ok) throw new Error('Failed to fetch history')
  return response.json()
}

/**
 * Get current running job
 */
export const getCurrentJob = async (): Promise<RunningJob | null> => {
  const response = await apiFetch(`${API_BASE}/snapraid/current-job`)
  if (!response.ok) throw new Error('Failed to fetch current job')
  return response.json()
}

/**
 * Abort the running job. SnapRAID stops at the next block and saves its state.
 */
export const abortJob = async (): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/snapraid/abort`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to abort job')
  }
}

/**
 * Get the last sync and scrub run of a config
 */
export const getLastRuns = async (configPath: string): Promise<LastRuns> => {
  const relativePath = configPath.replace(/^.*[/\\]/, '')
  const response = await apiFetch(
    `${API_BASE}/snapraid/last-runs?path=${encodeURIComponent(relativePath)}`,
  )
  if (!response.ok) throw new Error('Failed to fetch last runs')
  return response.json()
}

/**
 * Get parsed status from last status command
 */
export const getStatus = async (
  configPath?: string,
): Promise<{
  status: SnapRaidStatus
  timestamp: string
  exitCode: number | null
}> => {
  const relativePath = configPath
    ? configPath.replace(/^.*[/\\]/, '')
    : undefined
  const url = relativePath
    ? `${API_BASE}/snapraid/status?path=${encodeURIComponent(relativePath)}`
    : `${API_BASE}/snapraid/status`
  const response = await apiFetch(url)
  if (response.status === 409) throw new SnapRaidBusyError('SnapRAID is busy')
  if (!response.ok) throw new Error('Failed to fetch status')
  return response.json()
}

/**
 * SnapRAID holds its lock for a running job, so status cannot be read until it has finished
 */
export class SnapRaidBusyError extends Error {}

/**
 * Get size and free space of the parity disks, which status does not report
 */
export const getParityUsage = async (
  configPath: string,
): Promise<ParityLevelUsage[]> => {
  const relativePath = configPath.replace(/^.*[/\\]/, '')
  const response = await apiFetch(
    `${API_BASE}/snapraid/parity-usage?path=${encodeURIComponent(relativePath)}`,
  )
  if (!response.ok) throw new Error('Failed to fetch parity usage')
  return response.json()
}

/**
 * Validate SnapRAID config
 */
export const validateConfig = async (
  configPath: string,
): Promise<{ valid: boolean; exitCode: number; output: string }> => {
  const response = await apiFetch(`${API_BASE}/snapraid/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath }),
  })
  if (!response.ok) throw new Error('Failed to validate config')
  return response.json()
}

/**
 * Add a data disk to SnapRAID config
 */
export const addDataDisk = async (
  configPath: string,
  diskName: string,
  diskPath: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/add-data-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskName, diskPath }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to add data disk')
  }
  const result = await response.json()
  return result.config
}

/**
 * Add a parity disk to SnapRAID config
 */
export const addParityDisk = async (
  configPath: string,
  parityPath: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/add-parity-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, parityPath }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to add parity disk')
  }
  const result = await response.json()
  return result.config
}

/**
 * Remove the highest parity level from SnapRAID config
 */
export const removeParityDisk = async (
  configPath: string,
  level: number,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/remove-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskType: 'parity', level }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to remove disk')
  }
  const result = await response.json()
  return result.config
}

/**
 * Remove a data disk: points it to an empty directory and starts `sync -E` as a job,
 * the backend drops the disk from the config once the sync succeeded
 */
export const removeDataDisk = async (
  configPath: string,
  diskName: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/remove-data-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskName }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove disk')
  }
  const result = await response.json()
  return result.config
}

/**
 * Add an exclude pattern to SnapRAID config
 */
export const addExclude = async (
  configPath: string,
  pattern: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/add-exclude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, pattern }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to add exclude pattern')
  }
  const result = await response.json()
  return result.config
}

/**
 * Remove an exclude pattern from SnapRAID config
 */
export const removeExclude = async (
  configPath: string,
  pattern: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/remove-exclude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, pattern }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to remove exclude pattern')
  }
  const result = await response.json()
  return result.config
}

/**
 * Set pool directory in SnapRAID config
 */
export const setPool = async (
  configPath: string,
  poolPath: string | undefined,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/set-pool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, poolPath }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to set pool directory')
  }
  const result = await response.json()
  return result.config
}

/**
 * Get SMART report for all disks
 */
export const getSmart = async (configPath: string): Promise<SmartReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/smart?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get SMART report')
  }
  return response.json()
}

/**
 * Get power status of all disks (probe)
 */
export const probe = async (configPath: string): Promise<ProbeReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/probe?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to probe disk status')
  }
  return response.json()
}

/**
 * Get device information
 */
export const getDevices = async (
  configPath: string,
): Promise<DevicesReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/devices?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get device information')
  }
  return response.json()
}

/**
 * Get file list from SnapRAID
 */
export const getFileList = async (configPath: string): Promise<ListReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/list?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get file list')
  }
  return response.json()
}

/**
 * Report of the last check job of a config, read from its log
 */
export const getCheckReport = async (
  configPath: string,
): Promise<CheckReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/check-report?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get check report')
  }
  return response.json()
}

/**
 * Get duplicate files, from the hashes SnapRAID already stored
 */
export const getDup = async (configPath: string): Promise<DupReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/dup?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get duplicates')
  }
  return response.json()
}

/**
 * Get diff report from SnapRAID
 */
export const getDiff = async (configPath: string): Promise<DiffReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/diff?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get diff report')
  }
  return response.json()
}

/**
 * Disk replacement in progress for a config, or null
 */
export const getDiskReplacement = async (
  configPath: string,
): Promise<DiskReplacement | null> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/replace-disk?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw new Error('Failed to load disk replacement')
  return response.json()
}

/**
 * Point a failed disk to its replacement and start `fix -d`
 */
export const startDiskReplacement = async (
  configPath: string,
  diskName: string,
  newPath: string,
): Promise<DiskReplacement> => {
  const response = await apiFetch(`${API_BASE}/snapraid/replace-disk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, diskName, newPath }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to start disk replacement')
  }
  return response.json()
}

/**
 * Run a step of the disk replacement: fix again, check or the final sync
 */
export const runDiskReplacementStep = async (
  configPath: string,
  step: ReplacementStep,
): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/snapraid/replace-disk/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, step }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to run step')
  }
}

/**
 * Close a finished replacement or give up on it, scheduled jobs resume
 */
export const clearDiskReplacement = async (
  configPath: string,
): Promise<void> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/replace-disk?path=${encodeURIComponent(configPath)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error('Failed to close disk replacement')
}
