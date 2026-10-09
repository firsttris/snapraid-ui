import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, Stethoscope } from 'lucide-react'
import { ConfigBar } from '../components/ConfigBar'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { SmartMonitor } from '../components/SmartMonitor'
import { formatTestDuration } from '../components/SmartSelfTest'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { useControlSelfTests, useSelfTests, useSmart } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
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
          <div className="flex flex-wrap gap-2">
            <SelfTestAllMenu configPath={selectedConfig} />
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn('size-4', isFetching && 'animate-spin')}
              />
              {m.smart_monitor_refresh()}
            </Button>
          </div>
        )
      }
    >
      <ConfigBar>
        <SmartMonitor configPath={selectedConfig} />
      </ConfigBar>
    </PageLayout>
  )
}

// A short or long self-test of every disk at once, e.g. after setting up a new array
function SelfTestAllMenu({ configPath }: { configPath: string }) {
  const { confirm, toast } = useFeedback()
  const job = useJob()
  const { data: tests } = useSelfTests(configPath)
  const control = useControlSelfTests()
  const disks = (tests ?? [])
    .filter((test) => test.supported && !test.running)
    .map((test) => test.disk)
  const longest = Math.max(
    0,
    ...(tests ?? []).map((test) => test.durations?.long ?? 0),
  )

  const start = async (type: 'short' | 'long') => {
    const confirmed = await confirm({
      title: m.selftest_all_confirm_title(),
      message:
        type === 'long'
          ? m.selftest_all_long_confirm({
              count: disks.length,
              duration: formatTestDuration(longest || undefined),
            })
          : m.selftest_all_short_confirm({ count: disks.length }),
      confirmLabel:
        type === 'long' ? m.selftest_start_long() : m.selftest_start_short(),
    })
    if (!confirmed) return
    control.mutate(
      { configPath, disks, action: type },
      {
        onSuccess: (failed) =>
          failed.length > 0
            ? toast.error(
                failed.map(({ disk, error }) => `${disk}: ${error}`).join('\n'),
              )
            : toast.success(m.selftest_all_started({ count: disks.length })),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disks.length === 0 || job.isRunning || control.isPending}
        >
          <Stethoscope className="size-4" />
          {m.selftest_all()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => start('short')}>
          {m.selftest_all_short()}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => start('long')}>
          {m.selftest_all_long()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
