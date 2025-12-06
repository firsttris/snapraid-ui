import type { AppConfig, CommandOutput, ParsedSnapRaidConfig, SnapRaidCommand, RunningJob, LogFile } from "@shared/types";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';


const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/ws';

export class ApiClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private handlers: {
    onOutput?: (chunk: string, command: string) => void;
    onComplete?: (command: string, exitCode: number) => void;
    onError?: (error: string, command: string) => void;
    onStatus?: (status: any) => void;
  } = {};

  /**
   * Get app configuration
   */
  async getConfig(): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  }

  /**
   * Save app configuration
   */
  async saveConfig(config: AppConfig): Promise<void> {
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to save config');
  }

  /**
   * Parse a SnapRAID config file
   */
  async parseSnapRaidConfig(path: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/parse?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Failed to parse config');
    return response.json();
  }

  /**
   * Execute a SnapRAID command
   */
  async executeCommand(command: SnapRaidCommand, configPath: string, args: string[] = []): Promise<void> {
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
  async getHistory(): Promise<CommandOutput[]> {
    const response = await fetch(`${API_BASE}/api/history`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  }

  /**
   * Get current running job
   */
  async getCurrentJob(): Promise<RunningJob | null> {
    const response = await fetch(`${API_BASE}/api/snapraid/current-job`);
    if (!response.ok) throw new Error('Failed to fetch current job');
    return response.json();
  }

  /**
   * Add a new SnapRAID config
   */
  async addConfig(name: string, path: string, enabled: boolean = true): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, enabled }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add config');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Remove a SnapRAID config
   */
  async removeConfig(path: string): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) throw new Error('Failed to remove config');
    const result = await response.json();
    return result.config;
  }

  /**
   * Browse filesystem for .conf files
   */
  async browseFilesystem(path?: string, filter: 'conf' | 'directories' = 'conf'): Promise<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }> {
    let url = `${API_BASE}/api/filesystem/browse?filter=${filter}`;
    if (path) {
      url += `&path=${encodeURIComponent(path)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to browse filesystem');
    return response.json();
  }

  /**
   * Read file content
   */
  async readFile(path: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/filesystem/read?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Failed to read file');
    const result = await response.json();
    return result.content;
  }

  /**
   * Write file content
   */
  async writeFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/filesystem/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!response.ok) throw new Error('Failed to write file');
  }

  /**
   * Validate SnapRAID config
   */
  async validateConfig(configPath: string): Promise<{ valid: boolean; exitCode: number; output: string }> {
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
  async addDataDisk(configPath: string, diskName: string, diskPath: string): Promise<ParsedSnapRaidConfig> {
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
  async addParityDisk(configPath: string, parityPath: string): Promise<ParsedSnapRaidConfig> {
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
  async removeDisk(configPath: string, diskName: string | null, diskType: 'data' | 'parity'): Promise<ParsedSnapRaidConfig> {
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
  async addExclude(configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> {
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
  async removeExclude(configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> {
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
   * Connect to WebSocket for live updates
   */
  connectWebSocket(handlers: {
    onOutput?: (chunk: string, command: string) => void;
    onComplete?: (command: string, exitCode: number) => void;
    onError?: (error: string, command: string) => void;
    onStatus?: (status: any) => void;
  }): void {
    // Update handlers
    this.handlers = handlers;

    // If already connected, just update handlers and return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // If connecting, wait for it
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close existing connection if any (shouldn't happen with above checks)
    if (this.ws) {
      this.shouldReconnect = false;
      this.ws.close();
      this.ws = null;
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'output':
          this.handlers.onOutput?.(message.chunk, message.command);
          break;
        case 'complete':
          this.handlers.onComplete?.(message.command, message.exitCode);
          break;
        case 'error':
          this.handlers.onError?.(message.error, message.command);
          break;
        case 'status':
          this.handlers.onStatus?.(message.status);
          break;
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Only reconnect if we should (i.e., not manually disconnected)
      if (this.shouldReconnect) {
        this.reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          this.connectWebSocket(this.handlers);
        }, 3000);
      }
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get all log files
   */
  async getLogs(): Promise<LogFile[]> {
    const response = await fetch(`${API_BASE}/api/logs`);
    if (!response.ok) throw new Error('Failed to fetch logs');
    return response.json();
  }

  /**
   * Get log file content
   */
  async getLogContent(filename: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error('Failed to fetch log content');
    return response.text();
  }

  /**
   * Delete a log file
   */
  async deleteLog(filename: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete log');
  }

  /**
   * Trigger log rotation
   */
  async rotateLogs(): Promise<{ deleted: number }> {
    const response = await fetch(`${API_BASE}/api/logs/rotate`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to rotate logs');
    return response.json();
  }
}

export const apiClient = new ApiClient();

// ====================
// React Query Hooks
// ====================

// Query Keys
export const queryKeys = {
  config: ['config'] as const,
  snapraidConfig: (path: string) => ['snapraid-config', path] as const,
  currentJob: ['current-job'] as const,
  logs: ['logs'] as const,
  logContent: (filename: string) => ['log-content', filename] as const,
  filesystem: (path: string | undefined, filter: 'conf' | 'directories') => ['filesystem', path, filter] as const,
  fileContent: (path: string) => ['file-content', path] as const,
};

// Config Queries
export function useConfig(options?: Omit<UseQueryOptions<AppConfig>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => apiClient.getConfig(),
    ...options,
  });
}

export function useSnapRaidConfig(path: string | undefined, options?: Omit<UseQueryOptions<ParsedSnapRaidConfig>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.snapraidConfig(path!),
    queryFn: () => apiClient.parseSnapRaidConfig(path!),
    enabled: !!path,
    ...options,
  });
}

export function useCurrentJob(options?: Omit<UseQueryOptions<RunningJob | null>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.currentJob,
    queryFn: () => apiClient.getCurrentJob(),
    ...options,
  });
}

// Logs Queries
export function useLogs(options?: Omit<UseQueryOptions<LogFile[]>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.logs,
    queryFn: () => apiClient.getLogs(),
    ...options,
  });
}

export function useLogContent(filename: string | undefined, options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.logContent(filename!),
    queryFn: () => apiClient.getLogContent(filename!),
    enabled: !!filename,
    ...options,
  });
}

// Filesystem Queries
export function useFilesystem(path: string | undefined, filter: 'conf' | 'directories' = 'conf', options?: Omit<UseQueryOptions<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.filesystem(path, filter),
    queryFn: () => apiClient.browseFilesystem(path, filter),
    ...options,
  });
}

export function useFileContent(path: string | undefined, options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.fileContent(path!),
    queryFn: () => apiClient.readFile(path!),
    enabled: !!path,
    ...options,
  });
}

// Config Mutations
export function useSaveConfig(options?: UseMutationOptions<void, Error, AppConfig>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: AppConfig) => apiClient.saveConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

export function useAddConfig(options?: UseMutationOptions<AppConfig, Error, { name: string; path: string; enabled?: boolean }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, path, enabled = true }) => apiClient.addConfig(name, path, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

export function useRemoveConfig(options?: UseMutationOptions<AppConfig, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => apiClient.removeConfig(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

// SnapRAID Mutations
export function useExecuteCommand(options?: UseMutationOptions<void, Error, { command: SnapRaidCommand; configPath: string; args?: string[] }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ command, configPath, args = [] }) => apiClient.executeCommand(command, configPath, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentJob });
    },
    ...options,
  });
}

export function useAddDataDisk(options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; diskName: string; diskPath: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, diskName, diskPath }) => apiClient.addDataDisk(configPath, diskName, diskPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export function useAddParityDisk(options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; parityPath: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, parityPath }) => apiClient.addParityDisk(configPath, parityPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export function useRemoveDisk(options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; diskName: string | null; diskType: 'data' | 'parity' }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, diskName, diskType }) => apiClient.removeDisk(configPath, diskName, diskType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export function useAddExclude(options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; pattern: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, pattern }) => apiClient.addExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export function useRemoveExclude(options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; pattern: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, pattern }) => apiClient.removeExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export function useWriteFile(options?: UseMutationOptions<void, Error, { path: string; content: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }) => apiClient.writeFile(path, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContent(variables.path) });
    },
    ...options,
  });
}

// Logs Mutations
export function useDeleteLog(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => apiClient.deleteLog(filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs });
    },
    ...options,
  });
}

export function useRotateLogs(options?: UseMutationOptions<{ deleted: number }, Error, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.rotateLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs });
    },
    ...options,
  });
}

