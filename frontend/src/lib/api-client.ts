import type { AppConfig, CommandOutput, ParsedSnapRaidConfig, SnapRaidCommand, RunningJob, LogFile, SnapRaidStatus } from "@shared/types";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';


const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/ws';

// WebSocket state
const wsState = {
  ws: null as WebSocket | null,
  reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
  shouldReconnect: true,
  handlers: {} as {
    onOutput?: (chunk: string, command: string) => void;
    onComplete?: (command: string, exitCode: number) => void;
    onError?: (error: string, command: string) => void;
    onStatus?: (status: SnapRaidStatus) => void;
  },
};

/**
 * Get app configuration
 */
export const getConfig = async (): Promise<AppConfig> => {
  const response = await fetch(`${API_BASE}/api/config`);
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
}

/**
 * Save app configuration
 */
export const saveConfig = async (config: AppConfig): Promise<void> => {
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
 * Add a new SnapRAID config
 */
export const addConfig = async (name: string, path: string, enabled: boolean = true): Promise<AppConfig> => {
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
export const removeConfig = async (path: string): Promise<AppConfig> => {
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
export const browseFilesystem = async (path?: string, filter: 'conf' | 'directories' = 'conf'): Promise<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }> => {
  const url = `${API_BASE}/api/filesystem/browse?filter=${filter}${path ? `&path=${encodeURIComponent(path)}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to browse filesystem');
  return response.json();
}

/**
 * Read file content
 */
export const readFile = async (path: string): Promise<string> => {
  const response = await fetch(`${API_BASE}/api/filesystem/read?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error('Failed to read file');
  const result = await response.json();
  return result.content;
}

/**
 * Write file content
 */
export const writeFile = async (path: string, content: string): Promise<void> => {
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
 * Connect to WebSocket for live updates
 */
export const connectWebSocket = (handlers: {
  onOutput?: (chunk: string, command: string) => void;
  onComplete?: (command: string, exitCode: number) => void;
  onError?: (error: string, command: string) => void;
  onStatus?: (status: SnapRaidStatus) => void;
}): void => {
  // Update handlers
  wsState.handlers = handlers;

  // If already connected, just update handlers and return
  if (wsState.ws && wsState.ws.readyState === WebSocket.OPEN) {
    return;
  }

  // If connecting, wait for it
  if (wsState.ws && wsState.ws.readyState === WebSocket.CONNECTING) {
    return;
  }

  // Clear any pending reconnection
  if (wsState.reconnectTimeout) {
    clearTimeout(wsState.reconnectTimeout);
    wsState.reconnectTimeout = null;
  }

  // Close existing connection if any (shouldn't happen with above checks)
  if (wsState.ws) {
    wsState.shouldReconnect = false;
    wsState.ws.close();
    wsState.ws = null;
  }

  wsState.shouldReconnect = true;
  wsState.ws = new WebSocket(WS_URL);

  wsState.ws.onopen = () => {
    console.log('WebSocket connected');
  };

  wsState.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'output':
        wsState.handlers.onOutput?.(message.chunk, message.command);
        break;
      case 'complete':
        wsState.handlers.onComplete?.(message.command, message.exitCode);
        break;
      case 'error':
        wsState.handlers.onError?.(message.error, message.command);
        break;
      case 'status':
        wsState.handlers.onStatus?.(message.status);
        break;
    }
  };

  wsState.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  wsState.ws.onclose = () => {
    console.log('WebSocket disconnected');
    // Only reconnect if we should (i.e., not manually disconnected)
    if (wsState.shouldReconnect) {
      wsState.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        connectWebSocket(wsState.handlers);
      }, 3000);
    }
  };
}

/**
 * Disconnect WebSocket
 */
export const disconnectWebSocket = (): void => {
  wsState.shouldReconnect = false;
  
  if (wsState.reconnectTimeout) {
    clearTimeout(wsState.reconnectTimeout);
    wsState.reconnectTimeout = null;
  }
  
  if (wsState.ws) {
    wsState.ws.close();
    wsState.ws = null;
  }
}

/**
 * Get all log files
 */
export const getLogs = async (): Promise<LogFile[]> => {
  const response = await fetch(`${API_BASE}/api/logs`);
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}

/**
 * Get log file content
 */
export const getLogContent = async (filename: string): Promise<string> => {
  const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(filename)}`);
  if (!response.ok) throw new Error('Failed to fetch log content');
  return response.text();
}

/**
 * Delete a log file
 */
export const deleteLog = async (filename: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete log');
}

/**
 * Trigger log rotation
 */
export const rotateLogs = async (): Promise<{ deleted: number }> => {
  const response = await fetch(`${API_BASE}/api/logs/rotate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to rotate logs');
  return response.json();
}// ====================
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
export const useConfig = (options?: Omit<UseQueryOptions<AppConfig>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: getConfig,
    ...options,
  });
}

export const useSnapRaidConfig = (path: string | undefined, options?: Omit<UseQueryOptions<ParsedSnapRaidConfig>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.snapraidConfig(path!),
    queryFn: () => parseSnapRaidConfig(path!),
    enabled: !!path,
    ...options,
  });
}

export const useCurrentJob = (options?: Omit<UseQueryOptions<RunningJob | null>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.currentJob,
    queryFn: getCurrentJob,
    ...options,
  });
}

// Logs Queries
export const useLogs = (options?: Omit<UseQueryOptions<LogFile[]>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.logs,
    queryFn: getLogs,
    ...options,
  });
}

export const useLogContent = (filename: string | undefined, options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.logContent(filename!),
    queryFn: () => getLogContent(filename!),
    enabled: !!filename,
    ...options,
  });
}

// Filesystem Queries
export const useFilesystem = (path: string | undefined, filter: 'conf' | 'directories' = 'conf', options?: Omit<UseQueryOptions<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.filesystem(path, filter),
    queryFn: () => browseFilesystem(path, filter),
    ...options,
  });
}

export const useFileContent = (path: string | undefined, options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.fileContent(path!),
    queryFn: () => readFile(path!),
    enabled: !!path,
    ...options,
  });
}

// Config Mutations
export const useSaveConfig = (options?: UseMutationOptions<void, Error, AppConfig>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

export const useAddConfig = (options?: UseMutationOptions<AppConfig, Error, { name: string; path: string; enabled?: boolean }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, path, enabled = true }) => addConfig(name, path, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

export const useRemoveConfig = (options?: UseMutationOptions<AppConfig, Error, string>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    ...options,
  });
}

// SnapRAID Mutations
export const useExecuteCommand = (options?: UseMutationOptions<void, Error, { command: SnapRaidCommand; configPath: string; args?: string[] }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ command, configPath, args = [] }) => executeCommand(command, configPath, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentJob });
    },
    ...options,
  });
}

export const useAddDataDisk = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; diskName: string; diskPath: string }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, diskName, diskPath }) => addDataDisk(configPath, diskName, diskPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export const useAddParityDisk = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; parityPath: string }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, parityPath }) => addParityDisk(configPath, parityPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export const useRemoveDisk = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; diskName: string | null; diskType: 'data' | 'parity' }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, diskName, diskType }) => removeDisk(configPath, diskName, diskType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export const useAddExclude = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; pattern: string }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, pattern }) => addExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export const useRemoveExclude = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; pattern: string }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, pattern }) => removeExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapraidConfig(variables.configPath) });
    },
    ...options,
  });
}

export const useWriteFile = (options?: UseMutationOptions<void, Error, { path: string; content: string }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }) => writeFile(path, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContent(variables.path) });
    },
    ...options,
  });
}

// Logs Mutations
export const useDeleteLog = (options?: UseMutationOptions<void, Error, string>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs });
    },
    ...options,
  });
}

export const useRotateLogs = (options?: UseMutationOptions<{ deleted: number }, Error, void>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotateLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs });
    },
    ...options,
  });
}

