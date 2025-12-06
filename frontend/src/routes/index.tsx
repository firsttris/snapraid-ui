import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { apiClient, useConfig, useSnapRaidConfig, useCurrentJob, useExecuteCommand } from '../lib/api-client'
import type { SnapRaidStatus, SnapRaidCommand } from '@shared/types'
import { ConfigManager } from '../components/ConfigManager'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [status, setStatus] = useState<SnapRaidStatus | null>(null)
  const [output, setOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [currentCommand, setCurrentCommand] = useState<string>('')
  const [showConfigManager, setShowConfigManager] = useState(false)
  const [showConfigDropdown, setShowConfigDropdown] = useState(false)
  const [hasReconnected, setHasReconnected] = useState(false) // Track if we've already reconnected
  const outputRef = useRef<HTMLDivElement>(null)

  // TanStack Query hooks
  const { data: config, refetch: refetchConfig } = useConfig()
  const { data: parsedConfig } = useSnapRaidConfig(selectedConfig)
  const { data: currentJob, refetch: refetchCurrentJob } = useCurrentJob()
  const executeCommandMutation = useExecuteCommand()

  // Setup WebSocket message handlers
  useEffect(() => {
    apiClient.connectWebSocket({
      onOutput: (chunk: string, command: string) => {
        setOutput(prev => prev + chunk)
        setCurrentCommand(command)
      },
      onComplete: (command: string, exitCode: number) => {
        setIsRunning(false)
        setCurrentCommand('')
        console.log(`Command ${command} completed with exit code ${exitCode}`)
        // Invalidate currentJob query to reflect that no job is running
        refetchCurrentJob()
      },
      onError: (error: string) => {
        setIsRunning(false)
        setCurrentCommand('')
        setOutput(prev => prev + `\n\nError: ${error}`)
        // Invalidate currentJob query to reflect that no job is running
        refetchCurrentJob()
      },
      onStatus: (newStatus: any) => {
        setStatus(newStatus)
      },
    })
  }, [refetchCurrentJob])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Select first enabled config on mount
  useEffect(() => {
    if (config && !selectedConfig) {
      const firstEnabled = config.snapraidConfigs.find(c => c.enabled)
      if (firstEnabled) {
        setSelectedConfig(firstEnabled.path)
      }
    }
  }, [config, selectedConfig])

  // Check for running job on mount (only once)
  useEffect(() => {
    if (currentJob && !hasReconnected) {
      setIsRunning(true)
      setCurrentCommand(currentJob.command)
      setSelectedConfig(currentJob.configPath)
      setOutput(prev => prev + `\n[Reconnected to running job: ${currentJob.command}]\n`)
      setHasReconnected(true)
    } else if (!currentJob && hasReconnected) {
      // Job was running but is now finished
      setIsRunning(false)
      setCurrentCommand('')
    }
  }, [currentJob, hasReconnected])

  async function executeCommand(command: SnapRaidCommand) {
    if (!selectedConfig || isRunning) return
    
    setIsRunning(true)
    setOutput('')
    setCurrentCommand(command)
    
    executeCommandMutation.mutate({ command, configPath: selectedConfig }, {
      onError: (error) => {
        console.error('Failed to execute command:', error)
        setIsRunning(false)
      }
    })
  }

  const dataDiskCount = parsedConfig ? Object.keys(parsedConfig.data).length : 0
  const parityDiskCount = parsedConfig ? parsedConfig.parity.length : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">SnapRAID UI</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Config Selection */}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Active Configuration</h2>
              <button
                onClick={() => setShowConfigManager(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Manage Configs
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => !isRunning && setShowConfigDropdown(!showConfigDropdown)}
                disabled={isRunning}
                className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 bg-white text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedConfig ? (
                  <span className="text-gray-900 font-medium">
                    {config?.snapraidConfigs.find(c => c.path === selectedConfig)?.name} 
                    <span className="text-gray-500 font-normal"> — {selectedConfig}</span>
                  </span>
                ) : (
                  <span className="text-gray-500">Select a configuration...</span>
                )}
              </button>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                <svg className={`w-5 h-5 transition-transform ${showConfigDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {/* Custom Dropdown Menu */}
              {showConfigDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowConfigDropdown(false)} />
                  <div className="absolute z-20 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-60 overflow-auto">
                    {config?.snapraidConfigs.filter(c => c.enabled).length === 0 ? (
                      <div className="px-4 py-3 text-gray-500 text-sm text-center">
                        No configurations available
                      </div>
                    ) : (
                      config?.snapraidConfigs.filter(c => c.enabled).map((cfg) => (
                        <button
                          key={cfg.path}
                          onClick={() => {
                            setSelectedConfig(cfg.path)
                            setShowConfigDropdown(false)
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors ${
                            selectedConfig === cfg.path ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                          }`}
                        >
                          <div className="font-medium">{cfg.name}</div>
                          <div className="text-sm text-gray-500 font-mono mt-0.5">{cfg.path}</div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
            {!selectedConfig && (
              <p className="mt-3 text-sm text-gray-500 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                Please select a configuration to begin
              </p>
            )}
          </div>

          {/* Config Manager Modal */}
          {showConfigManager && config && (
            <ConfigManager 
              config={config.snapraidConfigs} 
              onConfigsChanged={refetchConfig}
              onClose={() => setShowConfigManager(false)}
            />
          )}

          {/* Dashboard Cards */}
          {parsedConfig && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Data Disks */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Data Disks</h3>
                <p className="text-3xl font-bold text-blue-600">{dataDiskCount}</p>
                <div className="mt-4 space-y-1">
                  {Object.entries(parsedConfig.data).map(([name, path]) => (
                    <div key={name} className="text-sm text-gray-600">
                      <span className="font-medium">{name}:</span> {path}
                    </div>
                  ))}
                </div>
              </div>

              {/* Parity Disks */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Parity Disks</h3>
                <p className="text-3xl font-bold text-purple-600">{parityDiskCount}</p>
                <div className="mt-4 space-y-1">
                  {parsedConfig.parity.map((path, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      {path}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Status</h3>
                {status ? (
                  <>
                    <div className={`text-sm font-medium mb-2 ${status.parityUpToDate ? 'text-green-600' : 'text-yellow-600'}`}>
                      {status.parityUpToDate ? '✓ Parity Up-to-date' : '⚠ Parity Outdated'}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>New files: <span className="font-medium">{status.newFiles}</span></div>
                      <div>Modified: <span className="font-medium">{status.modifiedFiles}</span></div>
                      <div>Deleted: <span className="font-medium">{status.deletedFiles}</span></div>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm">Run 'status' to see details</p>
                )}
              </div>
            </div>
          )}

          {/* Command Buttons */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Commands</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => executeCommand('status')}
                disabled={!selectedConfig || isRunning}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Status
              </button>
              <button
                onClick={() => executeCommand('diff')}
                disabled={!selectedConfig || isRunning}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Diff
              </button>
              <button
                onClick={() => executeCommand('sync')}
                disabled={!selectedConfig || isRunning}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Sync
              </button>
              <button
                onClick={() => executeCommand('scrub')}
                disabled={!selectedConfig || isRunning}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Scrub
              </button>
            </div>
            {isRunning && currentCommand && (
              <div className="mt-4 text-sm text-gray-600">
                Running: <span className="font-medium">{currentCommand}</span>
                <span className="animate-pulse ml-2">...</span>
              </div>
            )}
          </div>

          {/* Output/Logs */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Output</h2>
            <div
              ref={outputRef}
              className="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto whitespace-pre-wrap"
            >
              {output || 'No output yet. Run a command to see results.'}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
