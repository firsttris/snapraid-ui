import type { AppConfig, ParsedSnapRaidConfig, SnapRaidCommand, RunningJob, LogFile } from "@shared/types";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import {
  getConfig,
  saveConfig,
  addConfig,
  removeConfig,
} from '../lib/api/config';
import {
  parseSnapRaidConfig,
  executeCommand,
  getCurrentJob,
  addDataDisk,
  addParityDisk,
  removeDisk,
  addExclude,
  removeExclude,
  setPool,
} from '../lib/api/snapraid';
import {
  browseFilesystem,
  readFile,
  writeFile,
} from '../lib/api/filesystem';
import {
  getLogs,
  getLogContent,
  deleteLog,
  rotateLogs,
} from '../lib/api/logs';

// ====================
// Query Keys
// ====================

export const queryKeys = {
  config: ['config'] as const,
  snapraidConfig: (path: string) => ['snapraid-config', path] as const,
  currentJob: ['current-job'] as const,
  logs: ['logs'] as const,
  logContent: (filename: string) => ['log-content', filename] as const,
  filesystem: (path: string | undefined, filter: 'conf' | 'directories') => ['filesystem', path, filter] as const,
  fileContent: (path: string) => ['file-content', path] as const,
};

// ====================
// Config Queries
// ====================

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

// ====================
// Logs Queries
// ====================

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

// ====================
// Filesystem Queries
// ====================

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

// ====================
// Config Mutations
// ====================

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

// ====================
// SnapRAID Mutations
// ====================

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

export const useSetPool = (options?: UseMutationOptions<ParsedSnapRaidConfig, Error, { configPath: string; poolPath: string | undefined }>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configPath, poolPath }) => setPool(configPath, poolPath),
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

// ====================
// Logs Mutations
// ====================

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
