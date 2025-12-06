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
  backend: {
    host: string;
    port: number;
  };
  logs: {
    maxHistoryEntries: number;
    directory: string;
    maxFiles: number;
    maxAge: number;
  };
}

export interface ParsedSnapRaidConfig {
  parity: string[];
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

export interface SnapRaidStatus {
  hasErrors: boolean;
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
  fragmentedFiles?: number;
  wastedGB?: number;
  freeSpaceGB?: number; // Free space in GB
  rawOutput: string;
}

export interface CommandOutput {
  command: string;
  output: string;
  timestamp: string; // ISO string for JSON serialization
  exitCode: number | null;
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
}

// WebSocket message types
export interface WSMessage {
  type: 'output' | 'complete' | 'error' | 'status';
  command?: string;
  chunk?: string;
  exitCode?: number;
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

// Scheduling types
export interface Schedule {
  id: string;
  name: string;
  command: SnapRaidCommand;
  configPath: string;
  args?: string[];
  cronExpression: string; // Cron syntax: "0 2 * * *" = daily at 2 AM
  enabled: boolean;
  lastRun?: string; // ISO string
  nextRun?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
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
  timestamp: string;       // ISO string
  rawOutput: string;
}

// Check report types (from snapraid check command)
export interface CheckFileInfo {
  status: 'OK' | 'ERROR' | 'REHASH';  // Check status
  name: string;            // File path/name
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
