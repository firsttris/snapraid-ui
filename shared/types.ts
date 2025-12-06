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
  // Additional info from 'status' command
  scrubPercentage?: number; // % of array that is scrubbed
  syncInProgress?: boolean;
  oldestScrubDays?: number; // Days since oldest block was scrubbed
  fragmentedFiles?: number;
  wastedGB?: number;
  rawOutput: string;
}

export interface CommandOutput {
  command: string;
  output: string;
  timestamp: string; // ISO string for JSON serialization
  exitCode: number | null;
}

export type SnapRaidCommand = 'status' | 'sync' | 'scrub' | 'diff' | 'fix' | 'check' | 'pool' | 'smart' | 'probe' | 'up' | 'down';

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
