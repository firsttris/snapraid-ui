import type {
  CheckReport,
  CommandOutput,
  DataDiskUsage,
  DevicesReport,
  DiffReport,
  DiskReplacement,
  DiskSelfTest,
  DuplicateDeletion,
  DuplicateSkip,
  DupReport,
  FinishedJob,
  LastRuns,
  ListReport,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
  ProbeReport,
  ReplacementStep,
  RestoreFile,
  RunningJob,
  SelfTestType,
  SmartHistoryPoint,
  SmartReport,
  SnapRaidCommand,
  SnapRaidStatus,
  UsagePoint,
} from '@shared/types'
import { API_BASE, apiFetch } from './constants'
import { apiError } from './errors'

/**
 * Parse a SnapRAID config file
 */
export const parseSnapRaidConfig = async (
  path: string,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/parse?path=${encodeURIComponent(path)}`,
  )
  if (!response.ok) throw await apiError(response)
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
  const response = await apiFetch(`${API_BASE}/snapraid/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, configPath, args }),
  })
  if (!response.ok) {
    throw await apiError(response)
  }
}

/**
 * Repair the blocks marked as bad (fix -e), then check them again (scrub -p bad)
 */
export const healArray = async (configPath: string): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/snapraid/heal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath }),
  })
  if (!response.ok) {
    throw await apiError(response)
  }
}

/**
 * Get command history
 */
export const getHistory = async (): Promise<CommandOutput[]> => {
  const response = await apiFetch(`${API_BASE}/history`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Get current running job
 */
export const getCurrentJob = async (): Promise<RunningJob | null> => {
  const response = await apiFetch(`${API_BASE}/snapraid/current-job`)
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Outcome of the last finished job, for when its WebSocket completion was missed
 */
export const getLastJob = async (): Promise<FinishedJob | null> => {
  const response = await apiFetch(`${API_BASE}/snapraid/last-job`)
  if (!response.ok) throw await apiError(response)
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
    throw await apiError(response)
  }
}

/**
 * Get the last sync and scrub run of a config
 */
export const getLastRuns = async (configPath: string): Promise<LastRuns> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/last-runs?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
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
  const url = configPath
    ? `${API_BASE}/snapraid/status?path=${encodeURIComponent(configPath)}`
    : `${API_BASE}/snapraid/status`
  const response = await apiFetch(url)
  if (response.status === 409) throw new SnapRaidBusyError('SnapRAID is busy')
  if (!response.ok) throw await apiError(response)
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
  const response = await apiFetch(
    `${API_BASE}/snapraid/parity-usage?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Daily usage of the array, recorded on each status read
 */
export const getUsageHistory = async (
  configPath: string,
): Promise<UsagePoint[]> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/usage-history?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Get size and free space of the data disks, status only reports the free space
 */
export const getDataDiskUsage = async (
  configPath: string,
): Promise<DataDiskUsage[]> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/data-disk-usage?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
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
  if (!response.ok) throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
  }
  const result = await response.json()
  return result.config
}

const configOperation = async (
  endpoint: string,
  body: Record<string, unknown>,
): Promise<ParsedSnapRaidConfig> => {
  const response = await apiFetch(`${API_BASE}/snapraid/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await apiError(response)
  }
  const result = await response.json()
  return result.config
}

/**
 * Add a content file to SnapRAID config
 */
export const addContentFile = (configPath: string, contentPath: string) =>
  configOperation('add-content', { configPath, contentPath })

/**
 * Remove a content file from SnapRAID config
 */
export const removeContentFile = (configPath: string, contentPath: string) =>
  configOperation('remove-content', { configPath, contentPath })

/**
 * Set autosave (GiB) or blocksize (KiB), null removes the option
 */
export const setConfigOption = (
  configPath: string,
  option: 'autosave' | 'blocksize',
  value: number | null,
) => configOperation('set-option', { configPath, option, value })

/**
 * Get SMART report for all disks
 */
export const getSmart = async (configPath: string): Promise<SmartReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/smart?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    throw await apiError(response)
  }
  return response.json()
}

/**
 * Daily SMART values of the disks by name, recorded on each SMART read
 */
export const getSmartHistory = async (
  configPath: string,
): Promise<Record<string, SmartHistoryPoint[]>> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/smart-history?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Spin disks up or down; no disks means the whole array
 */
export const setDiskPower = async (
  configPath: string,
  action: 'up' | 'down',
  disks: string[] = [],
): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/snapraid/power`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, action, disks }),
  })
  if (!response.ok) throw await apiError(response)
}

/**
 * Get power status of all disks (probe)
 */
export const probe = async (configPath: string): Promise<ProbeReport> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/probe?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) {
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
  }
  return response.json()
}

/**
 * Bring files back from parity as they were at the last sync
 */
export const restoreFiles = async (
  configPath: string,
  files: RestoreFile[],
): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/snapraid/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, files }),
  })
  if (!response.ok) throw await apiError(response)
}

/**
 * Delete duplicates; each one only while it and the copy that stays are as at the last sync
 */
export const deleteDuplicates = async (
  configPath: string,
  files: DuplicateDeletion[],
): Promise<{ deleted: DuplicateDeletion[]; skipped: DuplicateSkip[] }> => {
  const response = await apiFetch(`${API_BASE}/snapraid/duplicates/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, files }),
  })
  if (!response.ok) throw await apiError(response)
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
    throw await apiError(response)
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
  if (!response.ok) throw await apiError(response)
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
    throw await apiError(response)
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
    throw await apiError(response)
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
  if (!response.ok) throw await apiError(response)
}

/**
 * SMART self-test status and log of each disk; sleeping disks are not woken
 */
export const getSelfTests = async (
  configPath: string,
): Promise<DiskSelfTest[]> => {
  const response = await apiFetch(
    `${API_BASE}/snapraid/smart-selftest?path=${encodeURIComponent(configPath)}`,
  )
  if (!response.ok) throw await apiError(response)
  return response.json()
}

/**
 * Start a short or long self-test on these disks, or stop theirs; the disks that refused, with why
 */
export const controlSelfTests = async (
  configPath: string,
  disks: string[],
  action: SelfTestType | 'abort',
): Promise<Array<{ disk: string; error: string }>> => {
  const response = await apiFetch(`${API_BASE}/snapraid/smart-selftest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configPath, disks, action }),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()).failed
}
