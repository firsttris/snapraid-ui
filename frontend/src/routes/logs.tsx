import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../components/Button'
import { errorMessage, useFeedback } from '../components/Feedback'
import { LogList } from '../components/LogList'
import { LogViewer } from '../components/LogViewer'
import { PageLayout } from '../components/PageLayout'
import { useLogs, useRotateLogs } from '../hooks/queries'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/logs')({
  validateSearch: (search: Record<string, unknown>): { file?: string } =>
    typeof search.file === 'string' ? { file: search.file } : {},
  component: LogsPage,
})

function LogsPage() {
  const { file: selectedLog = null } = Route.useSearch()
  const navigate = useNavigate({ from: '/logs' })
  const { confirm, toast } = useFeedback()
  const { refetch, isFetching } = useLogs()
  const rotateLogs = useRotateLogs()

  // The selection lives in the URL, so a log can be linked and survives a reload
  const selectLog = (filename: string | null) =>
    navigate({
      search: filename ? { file: filename } : {},
      replace: true,
    })

  const handleRotate = async () => {
    const confirmed = await confirm({
      title: m.logs_rotate_title(),
      message: m.logs_rotate_confirm(),
      confirmLabel: m.log_list_clean_old(),
      danger: true,
    })
    if (!confirmed) return
    rotateLogs.mutate(undefined, {
      onSuccess: ({ deleted }) =>
        deleted > 0
          ? toast.success(m.logs_rotated({ count: deleted }))
          : toast.info(m.logs_rotated_none()),
      onError: (error) =>
        toast.error(m.logs_rotate_failed({ error: errorMessage(error) })),
    })
  }

  return (
    <PageLayout
      title={m.logs()}
      actions={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {m.log_list_refresh()}
          </Button>
          <Button
            variant="ghostDanger"
            size="sm"
            onClick={handleRotate}
            disabled={rotateLogs.isPending}
          >
            <Trash2 size={14} />
            {m.log_list_clean_old()}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* On small screens list and log take turns */}
        <div className={selectedLog ? 'hidden lg:block' : ''}>
          <LogList selectedLog={selectedLog} onSelectLog={selectLog} />
        </div>
        <div
          className={`lg:sticky lg:top-6 ${selectedLog ? '' : 'hidden lg:block'}`}
        >
          <LogViewer selectedLog={selectedLog} onSelectLog={selectLog} />
        </div>
      </div>
    </PageLayout>
  )
}
