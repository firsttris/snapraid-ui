import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useConfig, useSnapRaidConfig, useCurrentJob, useExecuteCommand } from '../lib/api-client'
import type { SnapRaidCommand } from '@shared/types'
import { ConfigManager } from '../components/ConfigManager'
import { ConfigSelector } from '../components/ConfigSelector'
import { DashboardCards } from '../components/DashboardCards'
import { CommandPanel } from '../components/CommandPanel'
import { OutputConsole } from '../components/OutputConsole'
import { useWebSocketConnection } from '../hooks/useWebSocketConnection'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [showConfigManager, setShowConfigManager] = useState(false)

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
  }, [currentJob]) // Abhängigkeiten minimal halten

  const executeCommand = useCallback((command: SnapRaidCommand) => {
    if (!selectedConfig || wsState.isRunning) return
    
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

          <DashboardCards 
            parsedConfig={parsedConfig} 
            status={wsState.status} 
          />

          <CommandPanel
            onExecute={executeCommand}
            disabled={!selectedConfig}
            isRunning={wsState.isRunning}
            currentCommand={wsState.currentCommand}
          />

          <OutputConsole output={wsState.output} />
        </div>
      </main>
    </div>
  )
}
