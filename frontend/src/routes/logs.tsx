import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { LogList } from '../components/LogList'
import { LogViewer } from '../components/LogViewer'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">{m.logs()}</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LogList
              selectedLog={selectedLog}
              onSelectLog={setSelectedLog}
            />

            <LogViewer selectedLog={selectedLog} />
          </div>
        </div>
      </main>
    </div>
  )
}
