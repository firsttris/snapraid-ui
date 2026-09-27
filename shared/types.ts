// Shared types between frontend and backend
// Single source of truth for all type definitions

export interface SnapRaidConfig {
  name: string;
  path: string;
  enabled: boolean;
}

export interface AppConfig {
  version: string;
  snapraidConfigs: SnapRaidConfig[];
  logs: {
    maxHistoryEntries: number;
    directory: string;
    maxFiles: number;
    maxAge: number;
  };
}

// One parity level of the config: `parity`, `2-parity` ... `6-parity` or `z-parity`
export interface ParityLevel {
  level: number;           // 1-6, `z-parity` counts as level 3
  keyword: string;         // Config keyword, e.g. "2-parity"
  paths: string[];         // Parity files, more than one when the parity is split
}

export interface ParsedSnapRaidConfig {
  parity: ParityLevel[];   // Sorted by level
  content: string[];
  data: Record<string, string>;
  exclude: string[];
  pool?: string;
}

export interface DiskInfo {
  name: string;
  path: string;
  type: 'data' | 'parity';
}

export interface DiskStatusInfo {
  name: string;
  files: number;
  fragmentedFiles: number;
  excessFragments: number;
  wastedGB: number;
  usedGB: number;
  freeGB: number;
  usePercent: number;
}

export interface ScrubHistoryPoint {
  daysAgo: number;
  percentage: number;
}

export interface SnapRaidStatus {
  hasErrors: boolean;
  badBlocks?: number; // Blocks marked bad by scrub/check, repaired by `fix -e`
  parityUpToDate: boolean;
  newFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  equalFiles?: number; // From diff command
  movedFiles?: number; // From diff command
  copiedFiles?: number; // From diff command
  restoredFiles?: number; // From diff command
  // Additional info from 'status' command
  scrubPercentage?: number; // % of array that is scrubbed
  syncInProgress?: boolean;
  oldestScrubDays?: number; // Days since oldest block was scrubbed
  medianScrubDays?: number; // Median days since scrubbed
  newestScrubDays?: number; // Newest days since scrubbed
  fragmentedFiles?: number;
  wastedGB?: number;
  freeSpaceGB?: number; // Free space in GB
  totalFiles?: number;
  totalUsedGB?: number;
  totalFreeGB?: number;
  disks?: DiskStatusInfo[]; // Individual disk stats
  scrubHistory?: ScrubHistoryPoint[]; // Scrub history chart data
  rawOutput: string;
}

export interface CommandOutput {
  command: string;
  output: string;
  timestamp: string; // ISO string for JSON serialization
  exitCode: number | null;
  logPath?: string; // Structured log file written by SnapRAID (--log)
  aborted?: boolean; // Stopped on user request
}

export type SnapRaidCommand = 'status' | 'sync' | 'scrub' | 'diff' | 'fix' | 'check' | 'pool' | 'smart' | 'probe' | 'up' | 'down' | 'devices' | 'list';

export interface LogFile {
  filename: string;
  path: string;
  command: SnapRaidCommand;
  timestamp: string; // ISO string
  size: number;
}

export interface RunningJob {
  command: SnapRaidCommand;
  configPath: string;
  startTime: string; // ISO string
  processId: string;
  aborting?: boolean; // Abort requested, waiting for SnapRAID to save its state
}

// Outcome of a finished run, from the `summary:exit` tag of its log
export type RunResult = 'ok' | 'warning' | 'error' | 'aborted' | 'incomplete';

export interface LastRun {
  timestamp: string; // ISO string
  result: RunResult;
  logFile: string;
}

export interface LastRuns {
  sync: LastRun | null;
  scrub: LastRun | null;
}

// WebSocket message types
export interface WSMessage {
  type: 'output' | 'complete' | 'error' | 'status';
  command?: string;
  chunk?: string;
  exitCode?: number;
  aborted?: boolean;
  timestamp?: string;
  error?: string;
  status?: SnapRaidStatus;
}

// Filesystem types
export interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

// SMART & Disk Management types
export interface SmartDiskInfo {
  name: string;
  device: string;
  status: 'OK' | 'FAIL' | 'PREFAIL' | 'LOGFAIL' | 'LOGERR' | 'SELFERR' | 'UNKNOWN';
  temperature?: number;
  powerOnHours?: number;
  failureProbability?: number; // Percentage 0-100
  model?: string;
  serial?: string;
  size?: string;
  attributes?: SmartAttribute[];
}

export interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  raw: string;
  flag: string;
}

export interface DiskPowerStatus {
  name: string;
  device: string;
  status: 'Active' | 'Standby' | 'Idle' | 'Unknown';
}

export interface SmartReport {
  disks: SmartDiskInfo[];
  timestamp: string; // ISO string
  rawOutput: string;
}

export interface ProbeReport {
  disks: DiskPowerStatus[];
  timestamp: string; // ISO string
  rawOutput: string;
}

// Space of a parity level, SnapRAID status does not report parity disks
export interface ParityFileUsage {
  path: string;
  fileSizeGB: number | null;   // null while the parity file does not exist yet
  mount: string | null;        // Filesystem holding the file, null when unknown
  diskTotalGB: number | null;
  diskFreeGB: number | null;
}

export interface ParityLevelUsage {
  level: number;
  keyword: string;
  files: ParityFileUsage[];
  capacityGB: number | null;   // Size the parity can grow to: current files plus free space
}

// Scheduling types
export interface Schedule {
  id: string;
  name: string;
  command: SnapRaidCommand;
  configPath: string;
  args?: string[];
  cronExpression: string; // Cron syntax: "0 2 * * *" = daily at 2 AM
  enabled: boolean;
  // sync only: skip the run when diff reports more deleted files, null disables the check
  maxDeletedFiles?: number | null;
  lastRun?: string; // ISO string
  lastOutcome?: ScheduleOutcome;
  nextRun?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type ScheduleSkipReason = 'job_running' | 'too_many_deleted' | 'diff_failed';

// Result of the last scheduled run, including runs the scheduler skipped
export interface ScheduleOutcome {
  timestamp: string; // ISO string
  result: RunResult | 'skipped';
  skipReason?: ScheduleSkipReason;
  deletedFiles?: number; // Deleted files diff reported, for too_many_deleted
  error?: string;
}

export interface ScheduleConfig {
  schedules: Schedule[];
}

// Device types (from snapraid devices command)
export interface DeviceInfo {
  majorMinor: string;      // e.g., "259:0"
  device: string;          // e.g., "/dev/nvme0n1"
  partMajorMinor: string;  // e.g., "259:2"
  partition: string;       // e.g., "/dev/nvme0n1p2"
  diskName: string;        // e.g., "test1" or "parity"
}

export interface DevicesReport {
  devices: DeviceInfo[];
  timestamp: string;       // ISO string
  rawOutput: string;
}

// File list types (from snapraid list command)
export interface SnapRaidFileInfo {
  size: number;            // File size in bytes
  date: string;            // Date in format "2025/12/01"
  time: string;            // Time in format "07:54"
  name: string;            // File path/name
  disk?: string;           // Data disk name
}

export interface ListReport {
  files: SnapRaidFileInfo[];
  totalFiles: number;
  totalSize: number;       // Total size in bytes
  totalLinks: number;
  timestamp: string;       // ISO string
  rawOutput: string;
}

// Diff report types (from snapraid diff command)
export interface DiffFileInfo {
  status: 'equal' | 'added' | 'removed' | 'updated' | 'moved' | 'copied' | 'restored';
  name: string;            // File path/name
  disk?: string;           // Data disk name
  size?: string;           // File size if available
}

export interface DiffReport {
  files: DiffFileInfo[];
  totalFiles: number;
  equalFiles: number;
  newFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  movedFiles: number;
  copiedFiles: number;
  restoredFiles: number;
  failed?: boolean;        // SnapRAID stopped before writing a summary, counts are not reliable
  timestamp: string;       // ISO string
  rawOutput: string;
}

// Check report types (from snapraid check command)
export interface CheckFileInfo {
  status: 'OK' | 'ERROR' | 'REHASH';  // Check status
  name: string;            // File path/name
  disk?: string;           // Data disk (or parity level) name
  hash?: string;           // Hash value if available
  error?: string;          // Error message if status is ERROR
}

export interface CheckReport {
  files: CheckFileInfo[];
  totalFiles: number;
  errorCount: number;
  rehashCount: number;
  okCount: number;
  timestamp: string;       // ISO string
  rawOutput: string;
}

// SMART disk info (from snapraid smart command)
export interface SmartDiskInfo {
  name: string;
  device: string;
  status: 'OK' | 'UNKNOWN' | 'FAIL' | 'PREFAIL' | 'LOGFAIL' | 'LOGERR' | 'SELFERR';
  temperature?: number;
  powerOnHours?: number;
  failureProbability?: number;
  model?: string;
  serial?: string;
  size?: string;
}

// Probe disk info (from snapraid probe command)
export interface ProbeDiskInfo {
  name: string;
  device: string;
  status: 'Standby' | 'Active' | 'Idle' | 'Unknown';
}
