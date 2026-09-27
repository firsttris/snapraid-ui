import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { LogList } from '../components/LogList'
import { LogViewer } from '../components/LogViewer'
import { PageLayout } from '../components/PageLayout'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null)

  return (
    <PageLayout title={m.logs()}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LogList selectedLog={selectedLog} onSelectLog={setSelectedLog} />

        <LogViewer selectedLog={selectedLog} />
      </div>
    </PageLayout>
  )
}
