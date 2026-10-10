import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Hourglass } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { StatusAge } from '../components/ArrayHealthPanel'
import { ConfigBar } from '../components/ConfigBar'
import { errorMessage } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { LoadingHint } from '../components/Skeleton'
import { Alert, AlertDescription } from '../components/ui/alert'
import { useLastRuns, useStatus } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { SnapRaidBusyError } from '../lib/api/snapraid'
import { formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

// chart.js is only loaded with this page
const IntegrityReport = lazy(() =>
  import('../components/IntegrityReport').then((module) => ({
    default: module.IntegrityReport,
  })),
)

export const Route = createFileRoute('/integrity')({
  component: IntegrityPage,
})

function IntegrityPage() {
  const { selectedConfig } = useSelectedConfig()
  const job = useJob()
  // The same query as the dashboard: its status shows here right away
  const status = useStatus(selectedConfig, {
    enabled: !!selectedConfig,
    retry: (count, error) => !(error instanceof SnapRaidBusyError) && count < 3,
  })
  const { data: lastRuns } = useLastRuns(selectedConfig)
  const busy = status.error instanceof SnapRaidBusyError

  return (
    <PageLayout
      title={m.nav_integrity()}
      description={
        <div className="flex flex-col gap-1">
          <p className="max-w-3xl">{m.integrity_intro()}</p>
          {selectedConfig && (
            <StatusAge
              timestamp={status.data?.timestamp}
              isLoading={status.isFetching}
              disabled={job.isRunning}
              onRefresh={() => status.refetch()}
            />
          )}
        </div>
      }
    >
      <ConfigBar>
        {busy && (
          <Alert variant="info">
            <Hourglass />
            <AlertDescription className="text-inherit">
              {status.data
                ? m.health_busy_stale({
                    time: formatRelativeTime(
                      status.data.timestamp,
                      getLocale(),
                    ),
                  })
                : m.integrity_busy()}
            </AlertDescription>
          </Alert>
        )}
        {status.data ? (
          <Suspense fallback={<LoadingHint>{m.health_loading()}</LoadingHint>}>
            <IntegrityReport
              status={status.data.status}
              lastScrub={lastRuns?.scrub}
            />
          </Suspense>
        ) : status.isLoading ? (
          <LoadingHint>{m.health_loading()}</LoadingHint>
        ) : (
          status.error &&
          !busy && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                {m.integrity_error({ error: errorMessage(status.error) })}
              </AlertDescription>
            </Alert>
          )
        )}
      </ConfigBar>
    </PageLayout>
  )
}
