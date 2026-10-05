import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { ConfigBar } from '../components/ConfigBar'
import { PageLayout } from '../components/PageLayout'
import { SmartMonitor } from '../components/SmartMonitor'
import { Button } from '../components/ui/button'
import { useSmart } from '../hooks/queries'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { cn, formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/smart')({
  component: SmartPage,
})

function SmartPage() {
  const { selectedConfig } = useSelectedConfig()
  // Same query as the monitor, React Query reads it only once
  const {
    data: report,
    isFetching,
    refetch,
  } = useSmart(selectedConfig || undefined)

  return (
    <PageLayout
      title={m.nav_smart()}
      description={
        report && (
          <span title={new Date(report.timestamp).toLocaleString(getLocale())}>
            {m.smart_monitor_last_updated()}:{' '}
            {formatRelativeTime(report.timestamp, getLocale())}
          </span>
        )
      }
      actions={
        selectedConfig && (
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            {m.smart_monitor_refresh()}
          </Button>
        )
      }
    >
      <ConfigBar>
        <SmartMonitor configPath={selectedConfig} />
      </ConfigBar>
    </PageLayout>
  )
}
