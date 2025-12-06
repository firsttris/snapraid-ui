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
  rawOutput: string;
}

export interface CommandOutput {
  command: string;
  output: string;
  timestamp: string; // ISO string for JSON serialization
  exitCode: number | null;
}

export type SnapRaidCommand = 'status' | 'sync' | 'scrub' | 'diff' | 'fix' | 'check';

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
