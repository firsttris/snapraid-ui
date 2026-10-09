import type { ForceOption } from '@shared/force-option'
import {
  assessSmart,
  DEFAULT_SMART_FAILURE_THRESHOLD,
} from '@shared/smart-health'
import type {
  CheckReport,
  DevicesReport,
  DiffReport,
  DupReport,
  ListReport,
  SnapRaidCommand,
} from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  ArrayHealthPanel,
  DashboardActions,
  getArrayHealth,
  StatusAge,
} from '../components/ArrayHealthPanel'
import { CheckDialog } from '../components/CheckDialog'
import { CheckViewer } from '../components/CheckViewer'
import { ConfigBar } from '../components/ConfigBar'
import { DeviceList } from '../components/DeviceList'
import { DiffViewer } from '../components/DiffViewer'
import { DisksPanel } from '../components/DisksPanel'
import { DupViewer } from '../components/DupViewer'
import { errorMessage, useFeedback } from '../components/Feedback'
import { FileListViewer } from '../components/FileListViewer'
import { ForceRetryBox } from '../components/ForceRetryBox'
import { OutputConsole } from '../components/OutputConsole'
import { PageLayout } from '../components/PageLayout'
import { ScrubDialog } from '../components/ScrubDialog'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'
import { UndeleteDialog } from '../components/UndeleteDialog'
import {
  useDataDiskUsage,
  useExecuteCommand,
  useLastRuns,
  useNotificationSettings,
  useParityUsage,
  useProbe,
  useSchedules,
  useSmart,
  useSnapRaidConfig,
  useStatus,
  useUsageHistory,
} from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import {
  getCheckReport,
  getDevices,
  getDiff,
  getDup,
  getFileList,
  SnapRaidBusyError,
} from '../lib/api/snapraid'
import * as m from '../paraglide/messages'

// chart.js is only loaded once the status dialog is opened
const StatusModal = lazy(() =>
  import('../components/StatusModal').then((module) => ({
    default: module.StatusModal,
  })),
)

export const Route = createFileRoute('/')({
  component: Dashboard,
  // Lets the result toast of a check, shown on any page, open its report here
  validateSearch: (search: Record<string, unknown>): { report?: 'check' } =>
    search.report === 'check' ? { report: 'check' } : {},
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
  const { report: requestedReport } = Route.useSearch()
  const navigate = useNavigate()
  const job = useJob()
  const [showUndeleteDialog, setShowUndeleteDialog] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showSyncPreview, setShowSyncPreview] = useState(false)
  const [showScrubDialog, setShowScrubDialog] = useState(false)
  const [showCheckDialog, setShowCheckDialog] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const { data: parsedConfig, isLoading: isConfigLoading } =
    useSnapRaidConfig(selectedConfig)
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
  const { data: usageHistory } = useUsageHistory(
    selectedConfig,
    statusData?.timestamp,
  )
  const { data: parityUsage, isLoading: isParityLoading } =
    useParityUsage(selectedConfig)
  const { data: dataDiskUsage } = useDataDiskUsage(selectedConfig)
  const { data: schedules, isLoading: isSchedulesLoading } = useSchedules()
  const executeCommandMutation = useExecuteCommand()
  const { currentJob } = job
  // Unsupported on some controllers, the panel then just shows no power state
  const { data: probeReport } = useProbe(selectedConfig, {
    enabled: !job.isRunning,
    refetchInterval: PROBE_INTERVAL_MS,
    retry: false,
  })

  // smartctl leaves sleeping disks alone, the health tile flags disks about to fail
  const { data: smartReport } = useSmart(selectedConfig || undefined)
  const { data: notificationSettings } = useNotificationSettings()
  const smartCritical = useMemo(() => {
    const threshold =
      notificationSettings?.smartFailureThreshold ??
      DEFAULT_SMART_FAILURE_THRESHOLD
    return (smartReport?.disks ?? [])
      .filter((disk) => assessSmart(disk, threshold).level === 'critical')
      .map((disk) => disk.name)
  }, [smartReport, notificationSettings])

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
  const hasScrubSchedule = !!schedules?.some(
    (schedule) =>
      schedule.enabled &&
      schedule.configPath.replace(/^.*[/\\]/, '') === configFile &&
      (schedule.command === 'scrub' || !!schedule.scrubAfter),
  )

  // A job started elsewhere (other tab, schedule, before a reload) belongs to its config.
  // Also re-run once the config list has loaded (selectConfigByFile changes), after a reload
  // the running job is often known before the configs and could not be matched yet.
  const jobConfigPath = currentJob?.configPath
  useEffect(() => {
    if (jobConfigPath) selectConfigByFile(jobConfigPath)
  }, [jobConfigPath, selectConfigByFile])

  const runCommand = useCallback(
    (command: SnapRaidCommand, args: string[] = []) => {
      job.start(command)
      executeCommandMutation.mutate(
        { command, configPath: selectedConfig, args },
        {
          onError: (error) => job.fail(command, error.message),
        },
      )
    },
    [selectedConfig, job.start, job.fail, executeCommandMutation],
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

  // Opened from the result toast of a check, the parameter is dropped again so a reload does not reopen it
  useEffect(() => {
    if (requestedReport !== 'check' || !selectedConfig) return
    openReport('check')
    navigate({ to: '/', search: {}, replace: true })
  }, [requestedReport, selectedConfig, openReport, navigate])

  const executeCommand = useCallback(
    async (command: SnapRaidCommand) => {
      if (!selectedConfig || job.isRunning) return

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
    [selectedConfig, job.isRunning, runCommand, refetchStatus, openReport],
  )

  // A command picked in the command palette, possibly on another page
  const { pendingCommand, clearPendingCommand } = useAppShell()
  useEffect(() => {
    if (!pendingCommand || !selectedConfig) return
    clearPendingCommand()
    if (job.isRunning) return
    if (pendingCommand === 'fix') setShowUndeleteDialog(true)
    else executeCommand(pendingCommand)
  }, [
    pendingCommand,
    selectedConfig,
    job.isRunning,
    executeCommand,
    clearPendingCommand,
  ])

  const handleUndelete = useCallback(
    (
      mode: 'all-missing' | 'directory-missing' | 'specific',
      path?: string,
      diskFilter?: string,
    ) => {
      if (!selectedConfig || job.isRunning) return

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
    [selectedConfig, job.isRunning, runCommand],
  )

  // Repair blocks that scrub marked as bad; `scrub -p bad` verifies the result
  const handleFixErrors = useCallback(async () => {
    if (!selectedConfig || job.isRunning) return
    const confirmed = await confirm({
      message: m.health_fix_errors_confirm(),
      confirmLabel: m.health_fix_errors_start(),
      danger: true,
    })
    if (confirmed) runCommand('fix', ['-e'])
  }, [selectedConfig, job.isRunning, confirm, runCommand])

  const closeReport = () => setReport(null)

  // A safety stop of the job just run, or of the last sync or scrub in the logs (scheduled, before a reload)
  const forceStop: { command: SnapRaidCommand; option: ForceOption } | null =
    job.lastResult?.forceOption
      ? {
          command: job.lastResult.command as SnapRaidCommand,
          option: job.lastResult.forceOption,
        }
      : lastRuns?.sync?.forceOption
        ? { command: 'sync', option: lastRuns.sync.forceOption }
        : lastRuns?.scrub?.forceOption
          ? { command: 'scrub', option: lastRuns.scrub.forceOption }
          : null

  const actionsDisabled = !selectedConfig || job.isRunning
  const { syncDue } = getArrayHealth({
    status: statusData?.status,
    isStatusError,
    isBusy: statusError instanceof SnapRaidBusyError,
    lastSync: lastRuns?.sync,
    lastScrub: lastRuns?.scrub,
  })
  const handleExecute = (command: SnapRaidCommand) =>
    command === 'fix' ? setShowUndeleteDialog(true) : executeCommand(command)

  return (
    <PageLayout
      title={m.nav_dashboard()}
      description={
        selectedConfig && (
          <StatusAge
            timestamp={statusData?.timestamp}
            isLoading={isStatusFetching}
            disabled={actionsDisabled}
            onRefresh={() => refetchStatus()}
          />
        )
      }
      actions={
        selectedConfig && (
          <DashboardActions
            onExecute={handleExecute}
            disabled={actionsDisabled}
            syncDue={syncDue}
          />
        )
      }
    >
      <ConfigBar>
        <ArrayHealthPanel
          status={statusData?.status}
          isStatusLoading={isStatusFetching}
          isStatusError={isStatusError}
          isBusy={statusError instanceof SnapRaidBusyError}
          statusTimestamp={statusData?.timestamp}
          lastSync={lastRuns?.sync}
          lastScrub={lastRuns?.scrub}
          nextSchedule={nextSchedule}
          hasScrubSchedule={hasScrubSchedule}
          isSchedulesLoading={isSchedulesLoading}
          runningJob={
            job.isRunning &&
            (!currentJob ||
              currentJob.configPath.replace(/^.*[/\\]/, '') === configFile)
              ? {
                  command: job.currentCommand || currentJob?.command || '',
                  progress: job.progress,
                  isAborting: job.isAborting,
                }
              : undefined
          }
          onExecute={handleExecute}
          onAbort={job.abort}
          onFixErrors={handleFixErrors}
          onScrubBad={() => runCommand('scrub', ['-p', 'bad'])}
          onTouch={() => runCommand('touch')}
          actionsDisabled={actionsDisabled}
          smartCritical={smartCritical}
        />

        {!job.isRunning && forceStop && (
          <ForceRetryBox
            command={forceStop.command}
            option={forceStop.option}
            disabled={!selectedConfig}
            onRetry={(flag) => runCommand(forceStop.command, [flag])}
          />
        )}

        {job.output && (
          <OutputConsole
            output={job.output}
            command={job.currentCommand || job.lastResult?.command}
            isRunning={job.isRunning}
            lastFailed={
              !!job.lastResult &&
              !job.lastResult.aborted &&
              (!!job.lastResult.error || job.lastResult.exitCode !== 0)
            }
            onClear={job.clearOutput}
          />
        )}

        <DisksPanel
          parsedConfig={parsedConfig}
          status={statusData?.status}
          parityUsage={parityUsage}
          dataDiskUsage={dataDiskUsage}
          usageHistory={usageHistory}
          powerStates={probeReport?.disks}
          smartCritical={smartCritical}
          isConfigLoading={isConfigLoading}
          isStatusLoading={isStatusFetching}
          isParityLoading={isParityLoading}
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
          <Suspense fallback={null}>
            <StatusModal
              status={statusData.status}
              lastScrub={lastRuns?.scrub}
              onClose={() => setShowStatusModal(false)}
              onRefresh={refetchStatus}
            />
          </Suspense>
        )}
      </ConfigBar>
    </PageLayout>
  )
}
