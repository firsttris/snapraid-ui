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
  };
}

export interface ParsedSnapRaidConfig {
  parity: string[];
  content: string[];
  data: Record<string, string>;
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
  timestamp: string;
  exitCode: number | null;
}

export type SnapRaidCommand = 'status' | 'sync' | 'scrub' | 'diff';

export interface WSMessage {
  type: 'output' | 'complete' | 'error' | 'status';
  command?: string;
  chunk?: string;
  exitCode?: number;
  timestamp?: string;
  error?: string;
  status?: SnapRaidStatus;
}
