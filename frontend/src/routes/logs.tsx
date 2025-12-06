import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useLogs, useLogContent, useDeleteLog, useRotateLogs } from '../lib/api-client'
import { LogList } from '../components/LogList'
import { LogViewer } from '../components/LogViewer'
import type { SnapRaidCommand } from '@shared/types'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [filterCommand, setFilterCommand] = useState<SnapRaidCommand | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // TanStack Query hooks
  const { data: logs = [], isLoading: loading, refetch: refetchLogs } = useLogs()
  const { data: logContent = '', isLoading: loadingContent } = useLogContent(selectedLog ?? undefined)
  const deleteLogMutation = useDeleteLog()
  const rotateLogsMutation = useRotateLogs()

  const handleDeleteLog = (filename: string) => {
    if (!confirm(`Delete log file ${filename}?`)) return

    deleteLogMutation.mutate(filename, {
      onSuccess: () => {
        if (selectedLog === filename) {
          setSelectedLog(null)
        }
      },
      onError: (error) => {
        alert(`Failed to delete log: ${error}`)
      }
    })
  }

  const handleRotateLogs = () => {
    rotateLogsMutation.mutate(undefined, {
      onSuccess: (result) => {
        alert(`Deleted ${result.deleted} old log file(s)`)
      },
      onError: (error) => {
        alert(`Failed to rotate logs: ${error}`)
      }
    })
  }

  const handleDownloadLog = (filename: string) => {
    const blob = new Blob([logContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Log Files</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LogList
              logs={logs}
              isLoading={loading}
              selectedLog={selectedLog}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filterCommand={filterCommand}
              onFilterChange={setFilterCommand}
              onSelectLog={setSelectedLog}
              onDeleteLog={handleDeleteLog}
              onRefresh={refetchLogs}
              onRotate={handleRotateLogs}
            />

            <LogViewer
              selectedLog={selectedLog}
              logContent={logContent}
              isLoading={loadingContent}
              onDownload={handleDownloadLog}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
