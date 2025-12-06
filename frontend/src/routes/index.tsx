import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useConfig, useSnapRaidConfig, useCurrentJob, useExecuteCommand } from '../hooks/queries'
import type { SnapRaidCommand, DevicesReport, ListReport, CheckReport, DiffReport } from '@shared/types'
import { ConfigManager } from '../components/ConfigManager'
import { ConfigSelector } from '../components/ConfigSelector'
import { DashboardCards } from '../components/DashboardCards'
import { CommandPanel } from '../components/CommandPanel'
import { OutputConsole } from '../components/OutputConsole'
import { UndeleteDialog } from '../components/UndeleteDialog'
import { SmartMonitor } from '../components/SmartMonitor'
import { DiskPowerControl } from '../components/DiskPowerControl'
import { DeviceList } from '../components/DeviceList'
import { FileListViewer } from '../components/FileListViewer'
import { CheckViewer } from '../components/CheckViewer'
import { DiffViewer } from '../components/DiffViewer'
import { useWebSocketConnection } from '../hooks/useWebSocketConnection'
import { getSmart, probe, spinUp, spinDown, getDevices, getFileList, getCheck, getDiff } from '../lib/api/snapraid'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [showConfigManager, setShowConfigManager] = useState(false)
  const [showUndeleteDialog, setShowUndeleteDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'smart' | 'power'>('dashboard')
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
  const { data: config, refetch: refetchConfig } = useConfig()
  const { data: parsedConfig } = useSnapRaidConfig(selectedConfig)
  const { data: currentJob, refetch: refetchCurrentJob } = useCurrentJob()
  const executeCommandMutation = useExecuteCommand()

  // WebSocket connection hook
  const wsState = useWebSocketConnection(refetchCurrentJob)

  // Select first enabled config on mount
  useEffect(() => {
    if (config && !selectedConfig) {
      const firstEnabled = config.snapraidConfigs.find(c => c.enabled)
      if (firstEnabled) {
        setSelectedConfig(firstEnabled.path)
      }
    }
  }, [config, selectedConfig])

  // Handle reconnection to running jobs - nur einmal ausführen
  useEffect(() => {
    if (currentJob && !wsState.isRunning) {
      wsState.setIsRunning(true)
      wsState.setCurrentCommand(currentJob.command)
      setSelectedConfig(currentJob.configPath)
      wsState.appendOutput(`\n[Reconnected to running job: ${currentJob.command}]\n`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob])

  const executeCommand = useCallback(async (command: SnapRaidCommand) => {
    if (!selectedConfig || wsState.isRunning) return
    
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
    
    // Regular commands
    wsState.setIsRunning(true)
    wsState.clearOutput()
    wsState.setCurrentCommand(command)
    
    executeCommandMutation.mutate({ command, configPath: selectedConfig }, {
      onError: (error) => {
        console.error('Failed to execute command:', error)
        wsState.setIsRunning(false)
      }
    })
  }, [selectedConfig, wsState, executeCommandMutation])

  const handleUndelete = useCallback((mode: 'all-missing' | 'directory-missing' | 'specific', path?: string, diskFilter?: string) => {
    if (!selectedConfig || wsState.isRunning) return
    
    wsState.setIsRunning(true)
    wsState.clearOutput()
    wsState.setCurrentCommand('fix')
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
    
    executeCommandMutation.mutate({ command: 'fix', configPath: selectedConfig, args }, {
      onError: (error) => {
        console.error('Failed to execute undelete:', error)
        wsState.setIsRunning(false)
      }
    })
  }, [selectedConfig, wsState, executeCommandMutation])

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
              <DashboardCards 
                parsedConfig={parsedConfig} 
                status={wsState.status} 
              />

              <CommandPanel
                onExecute={executeCommand}
                onUndelete={() => setShowUndeleteDialog(true)}
                disabled={!selectedConfig}
                isRunning={wsState.isRunning}
                currentCommand={wsState.currentCommand}
              />

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
          {!selectedConfig && (activeTab === 'smart' || activeTab === 'power') && (
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
