import type { RunningJob } from '@shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useFeedback } from '../components/Feedback'
import { connectWebSocket } from '../lib/api/websocket'
import { getCommandLabel } from '../lib/commands'
import { type JobProgress, parseProgress } from '../lib/progress'
import * as m from '../paraglide/messages'
import { queryKeys, useAbortJob, useCurrentJob } from './queries'

// The WebSocket reports output and completion, polling catches jobs it missed (reload, reconnect)
const JOB_POLL_INTERVAL_MS = 5000

export interface JobResult {
  command: string
  exitCode: number | null
  aborted: boolean
  error?: string
  finishedAt: string
}

interface JobState {
  output: string
  currentCommand: string
  isRunning: boolean
  lastResult: JobResult | null
}

interface JobContextValue extends JobState {
  currentJob: RunningJob | null | undefined
  progress: JobProgress | null
  isAborting: boolean
  // Marks a job as started before the backend confirms it, so buttons lock right away
  start: (command: string) => void
  // The job could not be started at all
  fail: (command: string, error: string) => void
  abort: () => Promise<void>
  clearOutput: () => void
}

const JobContext = createContext<JobContextValue | null>(null)

const resultToast = (result: JobResult) => {
  const command = getCommandLabel(result.command)
  if (result.error) {
    return {
      kind: 'error' as const,
      message: m.commands_result_error({ command, error: result.error }),
    }
  }
  if (result.aborted) {
    return {
      kind: 'info' as const,
      message: m.commands_result_aborted({ command }),
    }
  }
  if (result.exitCode === 0) {
    return {
      kind: 'success' as const,
      message: m.commands_result_ok({ command }),
    }
  }
  return {
    kind: 'error' as const,
    message: m.commands_result_failed({
      command,
      code: String(result.exitCode),
    }),
  }
}

export const JobProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { confirm, toast } = useFeedback()
  const abortMutation = useAbortJob()
  const { data: currentJob, refetch: refetchCurrentJob } = useCurrentJob({
    refetchInterval: JOB_POLL_INTERVAL_MS,
  })
  const [state, setState] = useState<JobState>({
    output: '',
    currentCommand: '',
    isRunning: false,
    lastResult: null,
  })

  // The WebSocket handlers outlive renders, they reach the latest callbacks through this ref
  const finishRef = useRef<(result: JobResult) => void>(() => {})
  finishRef.current = (result: JobResult) => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      currentCommand: '',
      output: result.error
        ? `${prev.output}\n\nError: ${result.error}`
        : prev.output,
      lastResult: result,
    }))

    // A finished job changes status and run history, so reload them
    refetchCurrentJob()
    queryClient.invalidateQueries({ queryKey: queryKeys.status })
    queryClient.invalidateQueries({ queryKey: ['last-runs'] })
    queryClient.invalidateQueries({ queryKey: ['parity-usage'] })
    // Removing a data disk edits the config once its sync -E has finished
    queryClient.invalidateQueries({ queryKey: ['snapraid-config'] })

    const { kind, message } = resultToast(result)
    // The check report is read from the log afterwards, the dashboard opens it
    const action =
      result.command === 'check' && !result.aborted && !result.error
        ? {
            label: m.check_show_report(),
            onClick: () =>
              navigate({ to: '/', search: { report: 'check' as const } }),
          }
        : undefined
    toast[kind](message, action)
  }

  useEffect(() => {
    connectWebSocket({
      onOutput: (chunk, command) => {
        setState((prev) => ({
          ...prev,
          isRunning: true,
          output: prev.output + chunk,
          // Scheduled jobs only report "scheduled", the polled job knows the real command
          currentCommand:
            command === 'scheduled' ? prev.currentCommand : command,
        }))
      },
      onComplete: (command, exitCode, aborted) =>
        finishRef.current({
          command,
          exitCode,
          aborted,
          finishedAt: new Date().toISOString(),
        }),
      onError: (error, command) =>
        finishRef.current({
          command,
          exitCode: null,
          aborted: false,
          error,
          finishedAt: new Date().toISOString(),
        }),
    })
  }, [])

  // Pick up a job that was started elsewhere (other tab, schedule) or before a reload
  useEffect(() => {
    if (!currentJob) return
    setState((prev) => {
      if (prev.isRunning && prev.currentCommand) return prev
      return {
        ...prev,
        isRunning: true,
        currentCommand: currentJob.command,
        output: prev.isRunning
          ? prev.output
          : `${prev.output}\n[Reconnected to running job: ${currentJob.command}]\n`,
      }
    })
  }, [currentJob])

  const start = useCallback((command: string) => {
    setState((prev) => ({
      ...prev,
      isRunning: true,
      currentCommand: command,
      output: '',
    }))
  }, [])

  const fail = useCallback(
    (command: string, error: string) =>
      finishRef.current({
        command,
        exitCode: null,
        aborted: false,
        error,
        finishedAt: new Date().toISOString(),
      }),
    [],
  )

  const clearOutput = useCallback(
    () => setState((prev) => ({ ...prev, output: '' })),
    [],
  )

  const abort = useCallback(async () => {
    const confirmed = await confirm({
      message: m.commands_abort_confirm({
        command: getCommandLabel(state.currentCommand),
      }),
      confirmLabel: m.commands_abort(),
      danger: true,
    })
    if (!confirmed) return
    abortMutation.mutate(undefined, {
      onError: (error) => toast.error(error.message),
    })
  }, [abortMutation, confirm, toast, state.currentCommand])

  const progress = useMemo(
    () => (state.isRunning ? parseProgress(state.output) : null),
    [state.isRunning, state.output],
  )

  const value: JobContextValue = {
    ...state,
    currentJob,
    progress,
    isAborting: abortMutation.isPending || !!currentJob?.aborting,
    start,
    fail,
    abort,
    clearOutput,
  }

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>
}

export const useJob = (): JobContextValue => {
  const context = useContext(JobContext)
  if (!context) throw new Error('useJob must be used within JobProvider')
  return context
}
