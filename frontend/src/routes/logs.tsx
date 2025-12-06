import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { apiClient } from '../lib/api-client'
import type { LogFile, SnapRaidCommand } from '../types'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const [logs, setLogs] = useState<LogFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [filterCommand, setFilterCommand] = useState<SnapRaidCommand | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    setLoading(true)
    try {
      const logFiles = await apiClient.getLogs()
      setLogs(logFiles)
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function viewLog(filename: string) {
    setSelectedLog(filename)
    setLoadingContent(true)
    try {
      const content = await apiClient.getLogContent(filename)
      setLogContent(content)
    } catch (error) {
      console.error('Failed to load log content:', error)
      setLogContent(`Error loading log: ${error}`)
    } finally {
      setLoadingContent(false)
    }
  }

  async function deleteLog(filename: string) {
    if (!confirm(`Delete log file ${filename}?`)) return

    try {
      await apiClient.deleteLog(filename)
      setLogs(logs.filter(log => log.filename !== filename))
      if (selectedLog === filename) {
        setSelectedLog(null)
        setLogContent('')
      }
    } catch (error) {
      console.error('Failed to delete log:', error)
      alert(`Failed to delete log: ${error}`)
    }
  }

  async function rotateLogs() {
    try {
      const result = await apiClient.rotateLogs()
      alert(`Deleted ${result.deleted} old log file(s)`)
      await loadLogs()
    } catch (error) {
      console.error('Failed to rotate logs:', error)
      alert(`Failed to rotate logs: ${error}`)
    }
  }

  function downloadLog(filename: string) {
    const blob = new Blob([logContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = logs.filter(log => {
    const matchesCommand = filterCommand === 'all' || log.command === filterCommand
    const matchesSearch = log.filename.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCommand && matchesSearch
  })

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleString()
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
            {/* Log List */}
            <div className="bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    All Logs ({filteredLogs.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={loadLogs}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={rotateLogs}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium"
                    >
                      Clean Old
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  
                  <div className="flex gap-2 flex-wrap">
                    {(['all', 'status', 'sync', 'scrub', 'diff'] as const).map(cmd => (
                      <button
                        key={cmd}
                        onClick={() => setFilterCommand(cmd)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          filterCommand === cmd
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {cmd === 'all' ? 'All' : cmd}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-auto max-h-[calc(100vh-300px)]">
                {loading ? (
                  <div className="p-6 text-center text-gray-500">Loading logs...</div>
                ) : filteredLogs.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No logs found</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredLogs.map(log => (
                      <div
                        key={log.filename}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedLog === log.filename ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => viewLog(log.filename)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                log.command === 'sync' ? 'bg-green-100 text-green-800' :
                                log.command === 'scrub' ? 'bg-purple-100 text-purple-800' :
                                log.command === 'status' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {log.command}
                              </span>
                              <span className="text-sm text-gray-600">
                                {formatDate(log.timestamp)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {log.filename} • {formatFileSize(log.size)}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteLog(log.filename)
                            }}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Log Viewer */}
            <div className="bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedLog || 'Select a log to view'}
                  </h2>
                  {selectedLog && (
                    <button
                      onClick={() => downloadLog(selectedLog)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6">
                {loadingContent ? (
                  <div className="text-center text-gray-500">Loading...</div>
                ) : selectedLog ? (
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[calc(100vh-300px)] text-sm font-mono whitespace-pre-wrap">
                    {logContent}
                  </pre>
                ) : (
                  <div className="text-center text-gray-400 py-20">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg">Select a log file to view its content</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
