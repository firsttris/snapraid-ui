import type {
  CheckReport,
  DevicesReport,
  DiffReport,
  ListReport,
  SnapRaidCommand,
} from '@shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrayHealthPanel } from '../components/ArrayHealthPanel'
import { CheckViewer } from '../components/CheckViewer'
import { CommandPanel } from '../components/CommandPanel'
import { ConfigManager } from '../components/ConfigManager'
import { ConfigSelector } from '../components/ConfigSelector'
import { DashboardCards } from '../components/DashboardCards'
import { DeviceList } from '../components/DeviceList'
import { DiffViewer } from '../components/DiffViewer'
import { DiskPowerControl } from '../components/DiskPowerControl'
import { FileListViewer } from '../components/FileListViewer'
import { OutputConsole } from '../components/OutputConsole'
import { SmartMonitor } from '../components/SmartMonitor'
import { StatusModal } from '../components/StatusModal'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'
import { UndeleteDialog } from '../components/UndeleteDialog'
import {
  queryKeys,
  useAbortJob,
  useConfig,
  useCurrentJob,
  useExecuteCommand,
  useLastRuns,
  useSchedules,
  useSnapRaidConfig,
  useStatus,
} from '../hooks/queries'
import { useWebSocketConnection } from '../hooks/useWebSocketConnection'
import {
  getCheck,
  getDevices,
  getDiff,
  getFileList,
  getSmart,
  probe,
  spinDown,
  spinUp,
} from '../lib/api/snapraid'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [showConfigManager, setShowConfigManager] = useState(false)
  const [showUndeleteDialog, setShowUndeleteDialog] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showSyncPreview, setShowSyncPreview] = useState(false)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'smart' | 'power'>(
    'dashboard',
  )
  const [showDevicesModal, setShowDevicesModal] = useState(false)
  const [showFileListModal, setShowFileListModal] = useState(false)
  const [showCheckModal, setShowCheckModal] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [devicesData, setDevicesData] = useState<DevicesReport | null>(null)
  const [fileListData, setFileListData] = useState<ListReport | null>(null)
  const [checkData, setCheckData] = useState<CheckReport | null>(null)
  const [diffData, setDiffData] = useState<DiffReport | null>(null)
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [isLoadingFileList, setIsLoadingFileList] = useState(false)
  const [isLoadingCheck, setIsLoadingCheck] = useState(false)
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)

  // TanStack Query hooks
  const queryClient = useQueryClient()
  const { data: config, refetch: refetchConfig } = useConfig()
  const { data: parsedConfig } = useSnapRaidConfig(selectedConfig)
  const { data: currentJob, refetch: refetchCurrentJob } = useCurrentJob()
  const {
    data: statusData,
    refetch: refetchStatus,
    isFetching: isStatusFetching,
    isError: isStatusError,
  } = useStatus(selectedConfig, { enabled: !!selectedConfig })
  const { data: lastRuns } = useLastRuns(selectedConfig)
  const { data: schedules } = useSchedules()
  const executeCommandMutation = useExecuteCommand()
  const abortMutation = useAbortJob()

  // A finished job changes status and run history, so reload them
  const handleJobComplete = useCallback(() => {
    refetchCurrentJob()
    queryClient.invalidateQueries({ queryKey: queryKeys.status })
    queryClient.invalidateQueries({ queryKey: ['last-runs'] })
  }, [refetchCurrentJob, queryClient])

  // WebSocket connection hook
  const wsState = useWebSocketConnection(handleJobComplete)
  const [dismissedResult, setDismissedResult] = useState<string | null>(null)
  const isAborting = abortMutation.isPending || !!currentJob?.aborting

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

  const handleAbort = useCallback(() => {
    if (!confirm(m.commands_abort_confirm({ command: wsState.currentCommand })))
      return
    abortMutation.mutate(undefined, {
      onError: (error) => wsState.appendOutput(`\n[${error.message}]\n`),
    })
  }, [abortMutation, wsState])

  // Select first enabled config on mount
  useEffect(() => {
    if (config && !selectedConfig) {
      const firstEnabled = config.snapraidConfigs.find((c) => c.enabled)
      if (firstEnabled) {
        setSelectedConfig(firstEnabled.path)
      }
    }
  }, [config, selectedConfig])

  // Handle reconnection to running jobs - nur einmal ausführen
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to a newly detected job
  useEffect(() => {
    if (currentJob && !wsState.isRunning) {
      wsState.setIsRunning(true)
      wsState.setCurrentCommand(currentJob.command)
      setSelectedConfig(currentJob.configPath)
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
          onError: (error) => {
            console.error('Failed to execute command:', error)
            wsState.setError(command, error.message)
          },
        },
      )
    },
    [selectedConfig, wsState, executeCommandMutation],
  )

  const executeCommand = useCallback(
    async (command: SnapRaidCommand) => {
      if (!selectedConfig || wsState.isRunning) return

      // Show pending changes before sync, so accidental deletions are not synced away
      if (command === 'sync') {
        setShowSyncPreview(true)
        return
      }

      // Handle status command with modal
      if (command === 'status') {
        setShowStatusModal(true)
        await refetchStatus()
        return
      }

      // Handle devices and list commands differently
      if (command === 'devices') {
        setIsLoadingDevices(true)
        setShowDevicesModal(true)
        try {
          const data = await getDevices(selectedConfig)
          setDevicesData(data)
        } catch (error) {
          console.error('Failed to get devices:', error)
        } finally {
          setIsLoadingDevices(false)
        }
        return
      }

      if (command === 'list') {
        setIsLoadingFileList(true)
        setShowFileListModal(true)
        try {
          const data = await getFileList(selectedConfig)
          setFileListData(data)
        } catch (error) {
          console.error('Failed to get file list:', error)
        } finally {
          setIsLoadingFileList(false)
        }
        return
      }

      if (command === 'check') {
        setIsLoadingCheck(true)
        setShowCheckModal(true)
        try {
          const data = await getCheck(selectedConfig)
          setCheckData(data)
        } catch (error) {
          console.error('Failed to get check report:', error)
        } finally {
          setIsLoadingCheck(false)
        }
        return
      }

      if (command === 'diff') {
        setIsLoadingDiff(true)
        setShowDiffModal(true)
        try {
          const data = await getDiff(selectedConfig)
          setDiffData(data)
        } catch (error) {
          console.error('Failed to get diff report:', error)
        } finally {
          setIsLoadingDiff(false)
        }
        return
      }

      runCommand(command)
    },
    [selectedConfig, wsState, runCommand, refetchStatus],
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
    [selectedConfig, wsState, runCommand],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">SnapRAID UI</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <ConfigSelector
            config={config?.snapraidConfigs || []}
            selectedConfig={selectedConfig}
            onSelect={setSelectedConfig}
            disabled={wsState.isRunning}
            onManageClick={() => setShowConfigManager(true)}
          />

          {showConfigManager && config && (
            <ConfigManager
              config={config.snapraidConfigs}
              onConfigsChanged={refetchConfig}
              onClose={() => setShowConfigManager(false)}
            />
          )}

          {/* Tab Navigation */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'dashboard'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 Dashboard
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('smart')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'smart'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🔍 SMART Monitor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('power')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'power'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                ⚡ Disk Power
              </button>
            </nav>
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <>
              {selectedConfig && (
                <ArrayHealthPanel
                  status={statusData?.status}
                  isStatusLoading={isStatusFetching}
                  isStatusError={isStatusError}
                  lastSync={lastRuns?.sync}
                  lastScrub={lastRuns?.scrub}
                  nextSchedule={nextSchedule}
                  onRefresh={() => refetchStatus()}
                  onShowDetails={() => setShowStatusModal(true)}
                  refreshDisabled={wsState.isRunning}
                />
              )}

              <CommandPanel
                onExecute={executeCommand}
                onUndelete={() => setShowUndeleteDialog(true)}
                onAbort={handleAbort}
                disabled={!selectedConfig}
                isRunning={wsState.isRunning}
                isAborting={isAborting}
                currentCommand={wsState.currentCommand}
                lastResult={
                  wsState.lastResult?.finishedAt === dismissedResult
                    ? null
                    : wsState.lastResult
                }
                onDismissResult={() =>
                  setDismissedResult(wsState.lastResult?.finishedAt ?? null)
                }
              />

              <DashboardCards parsedConfig={parsedConfig} />

              {showSyncPreview && (
                <SyncPreviewDialog
                  configPath={selectedConfig}
                  hasUnsyncedParity={!!statusData?.status.syncInProgress}
                  onClose={() => setShowSyncPreview(false)}
                  onConfirm={() => {
                    setShowSyncPreview(false)
                    runCommand('sync')
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

              {showDevicesModal && (
                <DeviceList
                  devices={devicesData?.devices || []}
                  isLoading={isLoadingDevices}
                  onClose={() => setShowDevicesModal(false)}
                />
              )}

              {showFileListModal && (
                <FileListViewer
                  files={fileListData?.files || []}
                  totalFiles={fileListData?.totalFiles || 0}
                  totalSize={fileListData?.totalSize || 0}
                  totalLinks={fileListData?.totalLinks || 0}
                  isLoading={isLoadingFileList}
                  onClose={() => setShowFileListModal(false)}
                />
              )}

              {showCheckModal && (
                <CheckViewer
                  files={checkData?.files || []}
                  totalFiles={checkData?.totalFiles || 0}
                  errorCount={checkData?.errorCount || 0}
                  rehashCount={checkData?.rehashCount || 0}
                  okCount={checkData?.okCount || 0}
                  isLoading={isLoadingCheck}
                  onClose={() => setShowCheckModal(false)}
                />
              )}

              {showDiffModal && (
                <DiffViewer
                  files={diffData?.files || []}
                  totalFiles={diffData?.totalFiles || 0}
                  equalFiles={diffData?.equalFiles || 0}
                  newFiles={diffData?.newFiles || 0}
                  modifiedFiles={diffData?.modifiedFiles || 0}
                  deletedFiles={diffData?.deletedFiles || 0}
                  movedFiles={diffData?.movedFiles || 0}
                  copiedFiles={diffData?.copiedFiles || 0}
                  restoredFiles={diffData?.restoredFiles || 0}
                  isLoading={isLoadingDiff}
                  onClose={() => setShowDiffModal(false)}
                />
              )}

              {showStatusModal && statusData && (
                <StatusModal
                  status={statusData.status}
                  onClose={() => setShowStatusModal(false)}
                  onRefresh={refetchStatus}
                />
              )}

              <OutputConsole output={wsState.output} />
            </>
          )}

          {/* SMART Monitor Tab */}
          {activeTab === 'smart' && selectedConfig && (
            <SmartMonitor
              configPath={selectedConfig}
              onRefresh={() => getSmart(selectedConfig)}
            />
          )}

          {/* Disk Power Control Tab */}
          {activeTab === 'power' && selectedConfig && (
            <DiskPowerControl
              configPath={selectedConfig}
              onProbe={() => probe(selectedConfig)}
              onSpinUp={(disks) => spinUp(selectedConfig, disks)}
              onSpinDown={(disks) => spinDown(selectedConfig, disks)}
            />
          )}

          {/* Show message when no config is selected */}
          {!selectedConfig &&
            (activeTab === 'smart' || activeTab === 'power') && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800 font-medium">
                  Please select a SnapRAID configuration to use this feature
                </p>
              </div>
            )}
        </div>
      </main>
    </div>
  )
}
