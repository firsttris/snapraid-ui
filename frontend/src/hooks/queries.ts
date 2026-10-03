import type {
  AppConfig,
  AuthSession,
  DataDiskUsage,
  DiskReplacement,
  LastRuns,
  LogFile,
  NotificationSettings,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
  ProbeReport,
  ReplacementStep,
  RunningJob,
  Schedule,
  SmartReport,
  SnapRaidCommand,
  SnapRaidStatus,
} from '@shared/types'
import {
  skipToken,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getSession, logout } from '../lib/api/auth'
import {
  addConfig,
  checkConfigs,
  createConfig,
  getBasePath,
  getConfig,
  removeConfig,
  saveConfig,
  updateConfig,
} from '../lib/api/config'
import { browseFilesystem, readFile, writeFile } from '../lib/api/filesystem'
import { deleteLog, getLogContent, getLogs, rotateLogs } from '../lib/api/logs'
import { notificationsApi } from '../lib/api/notifications'
import { schedulesApi } from '../lib/api/schedules'
import {
  abortJob,
  addContentFile,
  addDataDisk,
  addExclude,
  addParityDisk,
  clearDiskReplacement,
  executeCommand,
  getCurrentJob,
  getDataDiskUsage,
  getDiskReplacement,
  getLastRuns,
  getParityUsage,
  getSmart,
  getStatus,
  parseSnapRaidConfig,
  probe,
  removeContentFile,
  removeDataDisk,
  removeExclude,
  removeParityDisk,
  runDiskReplacementStep,
  setConfigOption,
  setPool,
  startDiskReplacement,
} from '../lib/api/snapraid'

// ====================
// Query Keys
// ====================

export const queryKeys = {
  session: ['auth-session'] as const,
  config: ['config'] as const,
  // Below `config`, so invalidating the config refreshes the checks too
  configChecks: ['config', 'check'] as const,
  snapraidConfig: (path: string) => ['snapraid-config', path] as const,
  currentJob: ['current-job'] as const,
  status: ['status'] as const,
  lastRuns: (path: string) => ['last-runs', path] as const,
  parityUsage: (path: string) => ['parity-usage', path] as const,
  dataDiskUsage: (path: string) => ['data-disk-usage', path] as const,
  probe: (path: string) => ['probe', path] as const,
  smart: (path: string) => ['smart', path] as const,
  logs: ['logs'] as const,
  logContent: (filename: string) => ['log-content', filename] as const,
  filesystem: (path: string | undefined, filter: 'conf' | 'directories') =>
    ['filesystem', path, filter] as const,
  fileContent: (path: string) => ['file-content', path] as const,
  schedules: ['schedules'] as const,
  notifications: ['notifications'] as const,
  diskReplacement: (path: string) => ['disk-replacement', path] as const,
  schedule: (id: string) => ['schedule', id] as const,
}

// ====================
// Auth
// ====================

export const useSession = () => {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: getSession,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export const useLogout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData<AuthSession>(queryKeys.session, {
        enabled: true,
        authenticated: false,
      })
      // Drop everything cached for the logged-in user, including the persisted status.
      // The session query stays, removing it would detach the observer of the AuthGate
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.session[0],
      })
    },
  })
}

// ====================
// Config Queries
// ====================

export const useConfig = (
  options?: Omit<UseQueryOptions<AppConfig>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: getConfig,
    ...options,
  })
}

export const useSnapRaidConfig = (
  path: string | undefined,
  options?: Omit<UseQueryOptions<ParsedSnapRaidConfig>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.snapraidConfig(path ?? ''),
    queryFn: path ? () => parseSnapRaidConfig(path) : skipToken,
    ...options,
  })
}

export const useCurrentJob = (
  options?: Omit<UseQueryOptions<RunningJob | null>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.currentJob,
    queryFn: getCurrentJob,
    ...options,
  })
}

// Status survives page reloads (see __root.tsx), so the dashboard has data while a job holds SnapRAID's lock
export const STATUS_CACHE_MAX_AGE = 1000 * 60 * 60 * 24

export const useStatus = (
  configPath?: string,
  options?: Omit<
    UseQueryOptions<{
      status: SnapRaidStatus
      timestamp: string
      exitCode: number | null
    }>,
    'queryKey' | 'queryFn'
  >,
) => {
  return useQuery({
    queryKey: [...queryKeys.status, configPath],
    queryFn: () => getStatus(configPath),
    gcTime: STATUS_CACHE_MAX_AGE,
    ...options,
  })
}

export const useLastRuns = (
  configPath: string | undefined,
  options?: Omit<UseQueryOptions<LastRuns>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.lastRuns(configPath ?? ''),
    queryFn: configPath ? () => getLastRuns(configPath) : skipToken,
    ...options,
  })
}

export const useParityUsage = (
  configPath: string | undefined,
  options?: Omit<UseQueryOptions<ParityLevelUsage[]>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.parityUsage(configPath ?? ''),
    queryFn: configPath ? () => getParityUsage(configPath) : skipToken,
    ...options,
  })
}

export const useDataDiskUsage = (
  configPath: string | undefined,
  options?: Omit<UseQueryOptions<DataDiskUsage[]>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.dataDiskUsage(configPath ?? ''),
    queryFn: configPath ? () => getDataDiskUsage(configPath) : skipToken,
    ...options,
  })
}

// Probe reads the power state without waking disks in standby
export const useProbe = (
  configPath: string | undefined,
  options?: Omit<UseQueryOptions<ProbeReport>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.probe(configPath ?? ''),
    queryFn: configPath ? () => probe(configPath) : skipToken,
    ...options,
  })
}

// smartctl leaves sleeping disks alone, so loading it with the page does not spin them up
const SMART_STALE_MS = 5 * 60 * 1000

export const useSmart = (configPath: string | undefined) => {
  return useQuery<SmartReport>({
    queryKey: queryKeys.smart(configPath ?? ''),
    queryFn: configPath ? () => getSmart(configPath) : skipToken,
    staleTime: SMART_STALE_MS,
  })
}

// ====================
// Logs Queries
// ====================

export const useLogs = (
  options?: Omit<UseQueryOptions<LogFile[]>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.logs,
    queryFn: getLogs,
    ...options,
  })
}

export const useLogContent = (
  filename: string | undefined,
  options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.logContent(filename ?? ''),
    queryFn: filename ? () => getLogContent(filename) : skipToken,
    ...options,
  })
}

// ====================
// Filesystem Queries
// ====================

export const useFilesystem = (
  path: string | undefined,
  filter: 'conf' | 'directories' = 'conf',
  options?: Omit<
    UseQueryOptions<{
      path: string
      entries: Array<{ name: string; isDirectory: boolean; path: string }>
    }>,
    'queryKey' | 'queryFn'
  >,
) => {
  return useQuery({
    queryKey: queryKeys.filesystem(path, filter),
    queryFn: () => browseFilesystem(path, filter),
    ...options,
  })
}

export const useFileContent = (
  path: string | undefined,
  options?: Omit<UseQueryOptions<string>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.fileContent(path ?? ''),
    queryFn: path ? () => readFile(path) : skipToken,
    ...options,
  })
}

export const useBasePath = () => {
  return useQuery({
    queryKey: ['base-path'],
    queryFn: getBasePath,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export const useConfigChecks = () => {
  return useQuery({
    queryKey: queryKeys.configChecks,
    queryFn: checkConfigs,
  })
}

// ====================
// Config Mutations
// ====================

export const useCreateConfig = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, fileName }: { name: string; fileName: string }) =>
      createConfig(name, fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
    },
  })
}

export const useUpdateConfig = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      path,
      ...changes
    }: {
      path: string
      name?: string
      enabled?: boolean
    }) => updateConfig(path, changes),
    // Show the new name or switch state right away, rolled back if the backend refuses it
    onMutate: async ({ path, ...changes }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.config })
      const previous = queryClient.getQueryData<AppConfig>(queryKeys.config)
      if (previous) {
        queryClient.setQueryData<AppConfig>(queryKeys.config, {
          ...previous,
          snapraidConfigs: previous.snapraidConfigs.map((cfg) =>
            cfg.path === path ? { ...cfg, ...changes } : cfg,
          ),
        })
      }
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKeys.config, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
    },
  })
}

export const useSaveConfig = (
  options?: UseMutationOptions<void, Error, AppConfig>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
    },
    ...options,
  })
}

export const useAddConfig = (
  options?: UseMutationOptions<
    AppConfig,
    Error,
    { name: string; path: string; enabled?: boolean }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, path, enabled = true }) =>
      addConfig(name, path, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
    },
    ...options,
  })
}

export const useRemoveConfig = (
  options?: UseMutationOptions<AppConfig, Error, string>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
    },
    ...options,
  })
}

// ====================
// SnapRAID Mutations
// ====================

export const useExecuteCommand = (
  options?: UseMutationOptions<
    void,
    Error,
    { command: SnapRaidCommand; configPath: string; args?: string[] }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ command, configPath, args = [] }) =>
      executeCommand(command, configPath, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentJob })
    },
    ...options,
  })
}

export const useAddDataDisk = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; diskName: string; diskPath: string }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, diskName, diskPath }) =>
      addDataDisk(configPath, diskName, diskPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useAddParityDisk = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; parityPath: string }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, parityPath }) =>
      addParityDisk(configPath, parityPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useRemoveParityDisk = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; level: number }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, level }) => removeParityDisk(configPath, level),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useRemoveDataDisk = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; diskName: string }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, diskName }) =>
      removeDataDisk(configPath, diskName),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
      // The sync -E runs as a regular job, so the dashboard picks it up
      queryClient.invalidateQueries({ queryKey: queryKeys.currentJob })
    },
    ...options,
  })
}

export const useAddExclude = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; pattern: string }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, pattern }) => addExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useRemoveExclude = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; pattern: string }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, pattern }) => removeExclude(configPath, pattern),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useSetPool = (
  options?: UseMutationOptions<
    ParsedSnapRaidConfig,
    Error,
    { configPath: string; poolPath: string | undefined }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configPath, poolPath }) => setPool(configPath, poolPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
    ...options,
  })
}

export const useAddContentFile = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      configPath,
      contentPath,
    }: {
      configPath: string
      contentPath: string
    }) => addContentFile(configPath, contentPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
  })
}

export const useRemoveContentFile = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      configPath,
      contentPath,
    }: {
      configPath: string
      contentPath: string
    }) => removeContentFile(configPath, contentPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
  })
}

export const useSetConfigOption = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      configPath,
      option,
      value,
    }: {
      configPath: string
      option: 'autosave' | 'blocksize'
      value: number | null
    }) => setConfigOption(configPath, option, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.configPath),
      })
    },
  })
}

export const useWriteFile = (
  options?: UseMutationOptions<void, Error, { path: string; content: string }>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }) => writeFile(path, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileContent(variables.path),
      })
      // The visual editor reads the parsed config
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapraidConfig(variables.path),
      })
    },
    ...options,
  })
}

// ====================
// Logs Mutations
// ====================

export const useDeleteLog = (
  options?: UseMutationOptions<void, Error, string>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs })
    },
    ...options,
  })
}

export const useRotateLogs = (
  options?: UseMutationOptions<{ deleted: number }, Error, void>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: rotateLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs })
    },
    ...options,
  })
}

export const useAbortJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: abortJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentJob })
    },
  })
}

// ====================
// Schedules Queries
// ====================

export const useSchedules = (
  options?: Omit<UseQueryOptions<Schedule[]>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.schedules,
    queryFn: schedulesApi.getAll,
    ...options,
  })
}

export const useSchedule = (
  id: string | undefined,
  options?: Omit<UseQueryOptions<Schedule>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: queryKeys.schedule(id ?? ''),
    queryFn: id ? () => schedulesApi.getById(id) : skipToken,
    ...options,
  })
}

// ====================
// Schedules Mutations
// ====================

export const useCreateSchedule = (
  options?: UseMutationOptions<
    Schedule,
    Error,
    Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: schedulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
    },
    ...options,
  })
}

export const useUpdateSchedule = (
  options?: UseMutationOptions<
    Schedule,
    Error,
    { id: string; updates: Partial<Omit<Schedule, 'id' | 'createdAt'>> }
  >,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }) => schedulesApi.update(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
      queryClient.invalidateQueries({
        queryKey: queryKeys.schedule(variables.id),
      })
    },
    ...options,
  })
}

export const useDeleteSchedule = (
  options?: UseMutationOptions<void, Error, string>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: schedulesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
    },
    ...options,
  })
}

export const useToggleSchedule = (
  options?: UseMutationOptions<Schedule, Error, string>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: schedulesApi.toggle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
    },
    ...options,
  })
}

// ====================
// Disk Replacement
// ====================

export const useDiskReplacement = (
  configPath: string | undefined,
  options?: Omit<
    UseQueryOptions<DiskReplacement | null>,
    'queryKey' | 'queryFn'
  >,
) => {
  return useQuery({
    queryKey: queryKeys.diskReplacement(configPath ?? ''),
    queryFn: configPath ? () => getDiskReplacement(configPath) : skipToken,
    ...options,
  })
}

// Every step runs as a regular job, the dashboard picks it up
const useInvalidateReplacement = () => {
  const queryClient = useQueryClient()
  return (configPath: string) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.diskReplacement(configPath),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.snapraidConfig(configPath),
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.currentJob })
  }
}

export const useStartDiskReplacement = () => {
  const invalidate = useInvalidateReplacement()
  return useMutation({
    mutationFn: ({
      configPath,
      diskName,
      newPath,
    }: {
      configPath: string
      diskName: string
      newPath: string
    }) => startDiskReplacement(configPath, diskName, newPath),
    onSuccess: (_, { configPath }) => invalidate(configPath),
  })
}

export const useRunDiskReplacementStep = () => {
  const invalidate = useInvalidateReplacement()
  return useMutation({
    mutationFn: ({
      configPath,
      step,
    }: {
      configPath: string
      step: ReplacementStep
    }) => runDiskReplacementStep(configPath, step),
    onSuccess: (_, { configPath }) => invalidate(configPath),
  })
}

export const useClearDiskReplacement = () => {
  const invalidate = useInvalidateReplacement()
  return useMutation({
    mutationFn: clearDiskReplacement,
    onSuccess: (_, configPath) => invalidate(configPath),
  })
}

// ====================
// Notifications
// ====================

export const useNotificationSettings = () => {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: notificationsApi.get,
  })
}

export const useSaveNotificationSettings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.save,
    onSuccess: (settings: NotificationSettings) => {
      queryClient.setQueryData(queryKeys.notifications, settings)
    },
  })
}
