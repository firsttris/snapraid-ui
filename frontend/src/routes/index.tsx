import type {
  CheckReport,
  DevicesReport,
  DiffReport,
  DupReport,
  ListReport,
  SnapRaidCommand,
} from '@shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrayHealthPanel } from '../components/ArrayHealthPanel'
import { CheckDialog } from '../components/CheckDialog'
import { CheckViewer } from '../components/CheckViewer'
import { CommandPanel } from '../components/CommandPanel'
import { ConfigBar } from '../components/ConfigBar'
import { DeviceList } from '../components/DeviceList'
import { DiffViewer } from '../components/DiffViewer'
import { DisksPanel } from '../components/DisksPanel'
import { DupViewer } from '../components/DupViewer'
import { errorMessage, useFeedback } from '../components/Feedback'
import { FileListViewer } from '../components/FileListViewer'
import { OutputConsole } from '../components/OutputConsole'
import { PageLayout } from '../components/PageLayout'
import { ScrubDialog } from '../components/ScrubDialog'
import { StatusModal } from '../components/StatusModal'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'
import { UndeleteDialog } from '../components/UndeleteDialog'
import {
  queryKeys,
  useAbortJob,
  useCurrentJob,
  useExecuteCommand,
  useLastRuns,
  useParityUsage,
  useProbe,
  useSchedules,
  useSnapRaidConfig,
  useStatus,
} from '../hooks/queries'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { useWebSocketConnection } from '../hooks/useWebSocketConnection'
import {
  getCheckReport,
  getDevices,
  getDiff,
  getDup,
  getFileList,
  SnapRaidBusyError,
} from '../lib/api/snapraid'
import { parseProgress } from '../lib/progress'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

// Commands answered by a report dialog instead of streamed console output
type Report =
  | { kind: 'devices'; data: DevicesReport | null }
  | { kind: 'list'; data: ListReport | null }
  | { kind: 'check'; data: CheckReport | null }
  | { kind: 'diff'; data: DiffReport | null }
  | { kind: 'dup'; data: DupReport | null }

const REPORT_LOADERS = {
  devices: getDevices,
  list: getFileList,
  // check runs as a job, its report is read from the log afterwards
  check: getCheckReport,
  diff: getDiff,
  dup: getDup,
} as const

// Probe does not wake disks, so polling it keeps the power state fresh
const PROBE_INTERVAL_MS = 60_000

const isReportCommand = (command: SnapRaidCommand): command is Report['kind'] =>
  command in REPORT_LOADERS

function Dashboard() {
  const { selectedConfig, selectConfigByFile } = useSelectedConfig()
  const { confirm, toast } = useFeedback()
  const [showUndeleteDialog, setShowUndeleteDialog] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showSyncPreview, setShowSyncPreview] = useState(false)
  const [showScrubDialog, setShowScrubDialog] = useState(false)
  const [showCheckDialog, setShowCheckDialog] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  // TanStack Query hooks
  const queryClient = useQueryClient()
  const { data: parsedConfig, isLoading: isConfigLoading } =
    useSnapRaidConfig(selectedConfig)
  const { data: currentJob, refetch: refetchCurrentJob } = useCurrentJob()
  const {
    data: statusData,
    refetch: refetchStatus,
    isFetching: isStatusFetching,
    isError: isStatusError,
    error: statusError,
  } = useStatus(selectedConfig, {
    enabled: !!selectedConfig,
    // Busy clears up when the job finishes, which refetches the status anyway
    retry: (count, error) => !(error instanceof SnapRaidBusyError) && count < 3,
  })
  const { data: lastRuns } = useLastRuns(selectedConfig)
  const { data: parityUsage, isLoading: isParityLoading } =
    useParityUsage(selectedConfig)
  const { data: schedules, isLoading: isSchedulesLoading } = useSchedules()
  const executeCommandMutation = useExecuteCommand()
  const abortMutation = useAbortJob()

  // A finished job changes status and run history, so reload them
  const handleJobComplete = useCallback(() => {
    refetchCurrentJob()
    queryClient.invalidateQueries({ queryKey: queryKeys.status })
    queryClient.invalidateQueries({ queryKey: ['last-runs'] })
    queryClient.invalidateQueries({ queryKey: ['parity-usage'] })
    // Removing a data disk edits the config once its sync -E has finished
    queryClient.invalidateQueries({ queryKey: ['snapraid-config'] })
  }, [refetchCurrentJob, queryClient])

  // WebSocket connection hook
  const wsState = useWebSocketConnection(handleJobComplete)
  // Unsupported on some controllers, the panel then just shows no power state
  const { data: probeReport } = useProbe(selectedConfig, {
    enabled: !wsState.isRunning,
    refetchInterval: PROBE_INTERVAL_MS,
    retry: false,
  })
  const [dismissedResult, setDismissedResult] = useState<string | null>(null)
  const isAborting = abortMutation.isPending || !!currentJob?.aborting
  const progress = useMemo(
    () => (wsState.isRunning ? parseProgress(wsState.output) : null),
    [wsState.isRunning, wsState.output],
  )

  const configFile = selectedConfig.replace(/^.*[/\\]/, '')
  const nextSchedule = useMemo(
    () =>
      schedules
        ?.filter(
          (schedule) =>
            schedule.enabled &&
            schedule.nextRun &&
            schedule.configPath.replace(/^.*[/\\]/, '') === configFile &&
            new Date(schedule.nextRun).getTime() > Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.nextRun ?? 0).getTime() -
            new Date(b.nextRun ?? 0).getTime(),
        )[0],
    [schedules, configFile],
  )

  const handleAbort = useCallback(async () => {
    const confirmed = await confirm({
      message: m.commands_abort_confirm({ command: wsState.currentCommand }),
      confirmLabel: m.commands_abort(),
      danger: true,
    })
    if (!confirmed) return
    abortMutation.mutate(undefined, {
      onError: (error) => toast.error(error.message),
    })
  }, [abortMutation, confirm, toast, wsState.currentCommand])

  // Pick up a job that was started elsewhere (other tab, schedule) or before a reload
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to a newly detected job
  useEffect(() => {
    if (currentJob && !wsState.isRunning) {
      wsState.setIsRunning(true)
      wsState.setCurrentCommand(currentJob.command)
      selectConfigByFile(currentJob.configPath)
      wsState.appendOutput(
        `\n[Reconnected to running job: ${currentJob.command}]\n`,
      )
    }
  }, [currentJob])

  const runCommand = useCallback(
    (command: SnapRaidCommand, args: string[] = []) => {
      wsState.setIsRunning(true)
      wsState.clearOutput()
      wsState.setCurrentCommand(command)

      executeCommandMutation.mutate(
        { command, configPath: selectedConfig, args },
        {
          onError: (error) => wsState.setError(command, error.message),
        },
      )
    },
    [selectedConfig, wsState, executeCommandMutation],
  )

  const openReport = useCallback(
    async (kind: Report['kind']) => {
      setReport({ kind, data: null } as Report)
      try {
        const data = await REPORT_LOADERS[kind](selectedConfig)
        setReport((prev) =>
          prev?.kind === kind ? ({ kind, data } as Report) : prev,
        )
      } catch (error) {
        setReport(null)
        toast.error(m.report_failed({ error: errorMessage(error) }))
      }
    },
    [selectedConfig, toast],
  )

  const executeCommand = useCallback(
    async (command: SnapRaidCommand) => {
      if (!selectedConfig || wsState.isRunning) return

      // Show pending changes before sync, so accidental deletions are not synced away
      if (command === 'sync') {
        setShowSyncPreview(true)
        return
      }

      if (command === 'scrub') {
        setShowScrubDialog(true)
        return
      }

      if (command === 'check') {
        setShowCheckDialog(true)
        return
      }

      if (command === 'status') {
        setShowStatusModal(true)
        await refetchStatus()
        return
      }

      if (isReportCommand(command)) {
        await openReport(command)
        return
      }

      runCommand(command)
    },
    [selectedConfig, wsState.isRunning, runCommand, refetchStatus, openReport],
  )

  const handleUndelete = useCallback(
    (
      mode: 'all-missing' | 'directory-missing' | 'specific',
      path?: string,
      diskFilter?: string,
    ) => {
      if (!selectedConfig || wsState.isRunning) return

      setShowUndeleteDialog(false)

      // Build arguments based on mode
      const args: string[] = []

      // Add disk filter if specified (for recovery scenarios)
      if (diskFilter?.trim()) {
        args.push('-d', diskFilter.trim())
      }

      if (mode === 'all-missing') {
        args.push('-m')
      } else if (mode === 'directory-missing' && path) {
        args.push('-m', '-f', path)
      } else if (mode === 'specific' && path) {
        args.push('-f', path)
      }

      runCommand('fix', args)
    },
    [selectedConfig, wsState.isRunning, runCommand],
  )

  // Repair blocks that scrub marked as bad; `scrub -p bad` verifies the result
  const handleFixErrors = useCallback(async () => {
    if (!selectedConfig || wsState.isRunning) return
    const confirmed = await confirm({
      message: m.health_fix_errors_confirm(),
      confirmLabel: m.health_fix_errors_start(),
      danger: true,
    })
    if (confirmed) runCommand('fix', ['-e'])
  }, [selectedConfig, wsState.isRunning, confirm, runCommand])

  const closeReport = () => setReport(null)

  return (
    <PageLayout title={m.nav_dashboard()}>
      <ConfigBar disabled={wsState.isRunning}>
        <ArrayHealthPanel
          status={statusData?.status}
          isStatusLoading={isStatusFetching}
          isStatusError={isStatusError}
          isBusy={statusError instanceof SnapRaidBusyError}
          statusTimestamp={statusData?.timestamp}
          lastSync={lastRuns?.sync}
          lastScrub={lastRuns?.scrub}
          nextSchedule={nextSchedule}
          isSchedulesLoading={isSchedulesLoading}
          runningCommand={
            currentJob &&
            currentJob.configPath.replace(/^.*[/\\]/, '') === configFile
              ? currentJob.command
              : undefined
          }
          onRefresh={() => refetchStatus()}
          onShowDetails={() => setShowStatusModal(true)}
          onFixErrors={handleFixErrors}
          onScrubBad={() => runCommand('scrub', ['-p', 'bad'])}
          onTouch={() => runCommand('touch')}
          refreshDisabled={wsState.isRunning}
        />

        <CommandPanel
          onExecute={executeCommand}
          onUndelete={() => setShowUndeleteDialog(true)}
          onAbort={handleAbort}
          disabled={!selectedConfig}
          isRunning={wsState.isRunning}
          isAborting={isAborting}
          currentCommand={wsState.currentCommand}
          progress={progress}
          lastResult={
            wsState.lastResult?.finishedAt === dismissedResult
              ? null
              : wsState.lastResult
          }
          onShowCheckReport={() => openReport('check')}
          onDismissResult={() =>
            setDismissedResult(wsState.lastResult?.finishedAt ?? null)
          }
        />

        <DisksPanel
          parsedConfig={parsedConfig}
          status={statusData?.status}
          parityUsage={parityUsage}
          powerStates={probeReport?.disks}
          isConfigLoading={isConfigLoading}
          isStatusLoading={isStatusFetching}
          isParityLoading={isParityLoading}
        />

        <OutputConsole
          output={wsState.output}
          command={wsState.currentCommand || wsState.lastResult?.command}
          onClear={wsState.clearOutput}
        />

        {showSyncPreview && (
          <SyncPreviewDialog
            configPath={selectedConfig}
            hasUnsyncedParity={!!statusData?.status.syncIncomplete}
            onClose={() => setShowSyncPreview(false)}
            onConfirm={(args) => {
              setShowSyncPreview(false)
              runCommand('sync', args)
            }}
          />
        )}

        {showScrubDialog && (
          <ScrubDialog
            badBlocks={statusData?.status.badBlocks ?? 0}
            onClose={() => setShowScrubDialog(false)}
            onConfirm={(args) => {
              setShowScrubDialog(false)
              runCommand('scrub', args)
            }}
          />
        )}

        {showCheckDialog && parsedConfig && (
          <CheckDialog
            dataDisks={Object.keys(parsedConfig.data)}
            onClose={() => setShowCheckDialog(false)}
            onConfirm={(args) => {
              setShowCheckDialog(false)
              runCommand('check', args)
            }}
          />
        )}

        {showUndeleteDialog && parsedConfig && (
          <UndeleteDialog
            dataDisk={parsedConfig.data}
            onExecute={handleUndelete}
            onClose={() => setShowUndeleteDialog(false)}
          />
        )}

        {report?.kind === 'devices' && (
          <DeviceList
            devices={report.data?.devices || []}
            isLoading={!report.data}
            onClose={closeReport}
          />
        )}

        {report?.kind === 'list' && (
          <FileListViewer
            files={report.data?.files || []}
            totalFiles={report.data?.totalFiles || 0}
            totalSize={report.data?.totalSize || 0}
            totalLinks={report.data?.totalLinks || 0}
            isLoading={!report.data}
            onClose={closeReport}
          />
        )}

        {report?.kind === 'check' && (
          <CheckViewer
            files={report.data?.files || []}
            totalFiles={report.data?.totalFiles || 0}
            errorCount={report.data?.errorCount || 0}
            rehashCount={report.data?.rehashCount || 0}
            okCount={report.data?.okCount || 0}
            isLoading={!report.data}
            onClose={closeReport}
          />
        )}

        {report?.kind === 'diff' && (
          <DiffViewer
            files={report.data?.files || []}
            totalFiles={report.data?.totalFiles || 0}
            equalFiles={report.data?.equalFiles || 0}
            newFiles={report.data?.newFiles || 0}
            modifiedFiles={report.data?.modifiedFiles || 0}
            deletedFiles={report.data?.deletedFiles || 0}
            movedFiles={report.data?.movedFiles || 0}
            copiedFiles={report.data?.copiedFiles || 0}
            restoredFiles={report.data?.restoredFiles || 0}
            isLoading={!report.data}
            onClose={closeReport}
          />
        )}

        {report?.kind === 'dup' && (
          <DupViewer
            duplicates={report.data?.duplicates || []}
            totalSize={report.data?.totalSize || 0}
            isLoading={!report.data}
            onClose={closeReport}
          />
        )}

        {showStatusModal && statusData && (
          <StatusModal
            status={statusData.status}
            onClose={() => setShowStatusModal(false)}
            onRefresh={refetchStatus}
          />
        )}
      </ConfigBar>
    </PageLayout>
  )
}
