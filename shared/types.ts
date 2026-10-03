// Shared types between frontend and backend
import type { ForceOption } from "./force-option.ts";
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
  pendingRemoval: string[]; // Data disks pointing to their empty removal directory, waiting for `sync -E`
  exclude: string[];
  pool?: string;
  autosave?: number;       // GiB processed before sync/scrub saves the content file
  blocksize?: number;      // KiB, `block_size` is the older spelling
}

// Quick check of a config file, shown in the config manager
export interface ConfigFileCheck {
  path: string;
  exists: boolean;
  error?: string;          // Unreadable file
  dataDisks: number;
  parityLevels: number;
  contentFiles: number;
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
  syncIncomplete?: boolean; // Blocks without parity, the last sync was interrupted or failed
  unsyncedBlocks?: number;
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
  zeroSubsecondFiles?: number; // Files with a zero sub-second timestamp, fixed by `touch`
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

export type SnapRaidCommand = 'status' | 'sync' | 'scrub' | 'diff' | 'fix' | 'check' | 'pool' | 'smart' | 'probe' | 'devices' | 'list' | 'touch' | 'dup';

export interface LogFile {
  filename: string;
  path: string;
  command: SnapRaidCommand;
  timestamp: string; // ISO string
  size: number;
  modified?: string; // ISO string, last write; the end of the run once it has finished
  result?: RunResult; // Outcome read from the structured log, missing if it could not be read
  configPath?: string; // `conf:file` of the run
}

export interface RunningJob {
  command: SnapRaidCommand;
  configPath: string;
  startTime: string; // ISO string
  processId: string;
  aborting?: boolean; // Abort requested, waiting for SnapRAID to save its state
  logFile?: string; // Log the job is writing, it has no result yet
}

// Outcome of the last job, for clients that missed its WebSocket completion (reload, reconnect)
export interface FinishedJob {
  command: SnapRaidCommand;
  processId: string;
  exitCode: number | null;
  aborted: boolean;
  error?: string; // The job could not run at all
  forceOption?: ForceOption; // SnapRAID stopped for safety, this switch runs it anyway
  finishedAt: string; // ISO string
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
  family?: string;
  interface?: string;   // SATA, NVMe, ...
  rotationRate?: number; // rpm, 0 for SSDs
  serial?: string;
  size?: string;
  wearLevel?: number;   // SSD lifetime used in percent, may exceed 100
  errorMedium?: number; // Media errors, e.g. NVMe "Media and Data Integrity Errors"
  errorProtocol?: number; // Error log entries, harmless in most cases
  standby?: boolean; // Asleep; smartctl leaves it alone instead of spinning it up, so there is no data
  crcStableSince?: string; // ISO date since the transfer error count has not grown, it is then harmless
  attributes?: SmartAttribute[];
}

// Daily values of a disk, to see trends; missing values were not reported
export interface SmartHistoryPoint {
  date: string; // YYYY-MM-DD
  temperature?: number;
  reallocated?: number;
  pending?: number;
  crc?: number;
  wear?: number;
  mediaErrors?: number;
}

export interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  raw: string;
  flag: string;
  whenFailed?: 'now' | 'past'; // Normalized value is or was below its threshold
}

export interface DiskPowerStatus {
  name: string;
  device: string;
  status: 'Active' | 'Standby' | 'Idle' | 'Unknown';
}

export interface SmartReport {
  disks: SmartDiskInfo[];
  arrayFailureProbability?: number; // Percentage 0-100 that at least one array disk fails in the next year
  timestamp: string; // ISO string
  rawOutput: string;
}

export interface ProbeReport {
  disks: DiskPowerStatus[];
  timestamp: string; // ISO string
  rawOutput: string;
}

// Usage of an array on one day, from its status
export interface UsagePoint {
  date: string; // YYYY-MM-DD
  usedGB: number;
  freeGB: number;
  disks: Record<string, { usedGB: number; freeGB: number }>;
}

// Filesystem of a data disk, SnapRAID status reports only its free space
export interface DataDiskUsage {
  name: string;
  totalGB: number | null;      // null when df cannot read the filesystem
  freeGB: number | null;
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
  // sync only: run `touch` first, files with a zero sub-second timestamp get one so moves are detected
  touchBefore?: boolean;
  // sync only: scrub args to run after a successful sync, null or missing runs no scrub
  scrubAfter?: string[] | null;
  lastRun?: string; // ISO string
  lastOutcome?: ScheduleOutcome;
  nextRun?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type ScheduleSkipReason = 'job_running' | 'too_many_deleted' | 'diff_failed' | 'recovery_in_progress';

// One command of a scheduled run, e.g. touch, sync and scrub of a nightly sync
export interface ScheduleStepOutcome {
  command: SnapRaidCommand;
  result: RunResult | 'skipped';
}

// Result of the last scheduled run, including runs the scheduler skipped
export interface ScheduleOutcome {
  timestamp: string; // ISO string
  result: RunResult | 'skipped';
  skipReason?: ScheduleSkipReason;
  deletedFiles?: number; // Deleted files diff reported, for too_many_deleted
  error?: string;
  steps?: ScheduleStepOutcome[]; // Only for schedules that run more than one command
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

// Duplicate files (from snapraid dup command), found by comparing the stored hashes
export interface DuplicateFile {
  disk: string;
  name: string;            // Path relative to the disk
  originalDisk: string;    // The earlier file with the same content
  originalName: string;
  size: number;            // Bytes
}

export interface DupReport {
  duplicates: DuplicateFile[];
  totalDuplicates: number;
  totalSize: number;       // Bytes the duplicates take up
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

// Probe disk info (from snapraid probe command)
export interface ProbeDiskInfo {
  name: string;
  device: string;
  status: 'Standby' | 'Active' | 'Idle' | 'Unknown';
}

// Login state, auth is only enabled when username and password are set in the environment
export interface AuthSession {
  enabled: boolean;
  authenticated: boolean;
  username?: string;
}

// Disk replacement, following "Recovering" in the SnapRAID manual:
// point the disk to its new location, `fix -d`, optionally `check -a -d`, then `sync`
export type ReplacementStep = 'fix' | 'check' | 'sync';

export interface ReplacementStepResult {
  result: RunResult;
  finishedAt: string;      // ISO string
  recovered?: number;      // fix: blocks restored from parity
  unrecoverable?: number;  // fix/check: blocks that could not be restored
  errors?: number;         // I/O and data errors
  logFile?: string;
}

export interface DiskReplacement {
  configPath: string;      // As passed by the client
  diskName: string;        // Data disk name or parity keyword, e.g. "d1" or "2-parity"
  diskType: 'data' | 'parity';
  oldPath: string;
  newPath: string;
  startedAt: string;       // ISO string
  completedAt?: string;    // Set by a successful sync, scheduled jobs are paused until then
  steps: Partial<Record<ReplacementStep, ReplacementStepResult>>;
}

// Notifications
export type NotificationEvent = 'job_failed' | 'data_errors' | 'schedule_skipped' | 'smart_warning' | 'job_succeeded';
export type NotificationChannel = 'email' | 'ntfy' | 'webhook';

// Returned instead of stored passwords and tokens; sending it back keeps the stored value
export const SECRET_MASK = '********';

export interface NotificationSettings {
  language: 'en' | 'de' | 'it';
  uiUrl: string;                 // Link in messages, e.g. http://nas:3000; empty for none
  events: Record<NotificationEvent, boolean>;
  includeManualJobs: boolean;    // Also report jobs started in the UI, not only scheduled ones
  smartFailureThreshold: number; // Warn when a disk's yearly failure probability reaches this percentage
  email: {
    enabled: boolean;
    host: string;
    port: number;
    security: 'starttls' | 'tls' | 'none';
    username: string;
    password: string;
    from: string;
    to: string;                  // Comma separated
  };
  ntfy: {
    enabled: boolean;
    server: string;
    topic: string;
    token: string;               // Access token for protected topics, may be empty
  };
  webhook: {
    enabled: boolean;
    url: string;
  };
}

export interface NotificationTestResult {
  channel: NotificationChannel;
  ok: boolean;
  error?: string;
}
