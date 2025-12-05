import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { apiClient } from '../lib/api-client'
import type { AppConfig, ParsedSnapRaidConfig, SnapRaidStatus, SnapRaidCommand } from '../types'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [parsedConfig, setParsedConfig] = useState<ParsedSnapRaidConfig | null>(null)
  const [status, setStatus] = useState<SnapRaidStatus | null>(null)
  const [output, setOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [currentCommand, setCurrentCommand] = useState<string>('')
  const outputRef = useRef<HTMLDivElement>(null)

  // Load config on mount
  useEffect(() => {
    loadConfig()
    
    // Connect WebSocket
    apiClient.connectWebSocket({
      onOutput: (chunk, command) => {
        setOutput(prev => prev + chunk)
        setCurrentCommand(command)
      },
      onComplete: (command, exitCode) => {
        setIsRunning(false)
        setCurrentCommand('')
        console.log(`Command ${command} completed with exit code ${exitCode}`)
      },
      onError: (error, command) => {
        setIsRunning(false)
        setCurrentCommand('')
        setOutput(prev => prev + `\n\nError: ${error}`)
      },
      onStatus: (newStatus) => {
        setStatus(newStatus)
      },
    })

    return () => {
      apiClient.disconnectWebSocket()
    }
  }, [])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Load selected config when changed
  useEffect(() => {
    if (selectedConfig) {
      loadSnapRaidConfig(selectedConfig)
    }
  }, [selectedConfig])

  async function loadConfig() {
    try {
      const cfg = await apiClient.getConfig()
      setConfig(cfg)
      
      // Select first enabled config
      const firstEnabled = cfg.snapraidConfigs.find(c => c.enabled)
      if (firstEnabled) {
        setSelectedConfig(firstEnabled.path)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  async function loadSnapRaidConfig(path: string) {
    try {
      const parsed = await apiClient.parseSnapRaidConfig(path)
      setParsedConfig(parsed)
    } catch (error) {
      console.error('Failed to parse SnapRAID config:', error)
    }
  }

  async function executeCommand(command: SnapRaidCommand) {
    if (!selectedConfig || isRunning) return
    
    setIsRunning(true)
    setOutput('')
    setCurrentCommand(command)
    
    try {
      await apiClient.executeCommand(command, selectedConfig)
    } catch (error) {
      console.error('Failed to execute command:', error)
      setIsRunning(false)
    }
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
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <select
              value={selectedConfig}
              onChange={(e) => setSelectedConfig(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              disabled={isRunning}
            >
              <option value="">Select a config...</option>
              {config?.snapraidConfigs.filter(c => c.enabled).map((cfg) => (
                <option key={cfg.path} value={cfg.path}>
                  {cfg.name} ({cfg.path})
                </option>
              ))}
            </select>
          </div>

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
