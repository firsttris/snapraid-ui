import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RefreshCw, Trash2 } from 'lucide-react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { LogList } from '../components/LogList'
import { LogViewer } from '../components/LogViewer'
import { PageLayout } from '../components/PageLayout'
import { Button } from '../components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip'
import { useConfig, useLogs, useRotateLogs } from '../hooks/queries'
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
  const { data: logs, refetch, isFetching } = useLogs()
  const { data: config } = useConfig()
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

  const maxFiles = config?.logs.maxFiles ?? 0
  const maxAge = config?.logs.maxAge ?? 0
  const retention =
    maxFiles > 0 && maxAge > 0
      ? m.logs_retention_both({ files: maxFiles, days: maxAge })
      : maxFiles > 0
        ? m.logs_retention_files({ files: maxFiles })
        : maxAge > 0
          ? m.logs_retention_days({ days: maxAge })
          : undefined
  const description = [
    logs && m.log_list_count({ count: logs.length }),
    retention,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageLayout
      title={m.logs()}
      description={description || undefined}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRotate}
            disabled={rotateLogs.isPending}
          >
            <Trash2 />
            {m.log_list_clean_old()}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label={m.log_list_refresh()}
              >
                <RefreshCw className={isFetching ? 'animate-spin' : ''} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{m.log_list_refresh()}</TooltipContent>
          </Tooltip>
        </div>
      }
    >
      {/* List and log sit side by side once the page is wide enough, below that they take turns */}
      <div className="@container">
        <div className="flex flex-col gap-6 @4xl:flex-row @4xl:items-start">
          <div
            className={`min-w-0 flex-col @4xl:flex @4xl:w-80 @4xl:shrink-0 ${selectedLog ? 'hidden' : 'flex'}`}
          >
            <LogList selectedLog={selectedLog} onSelectLog={selectLog} />
          </div>
          <div
            className={`min-w-0 flex-1 flex-col @4xl:sticky @4xl:top-20 @4xl:flex ${selectedLog ? 'flex' : 'hidden'}`}
          >
            <LogViewer selectedLog={selectedLog} onSelectLog={selectLog} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
