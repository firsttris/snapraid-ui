import type { DiskSelfTest, SelfTestLogEntry } from '@shared/types'
import { Moon, Play, RefreshCw, Square } from 'lucide-react'
import { useControlSelfTests } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import { cn } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { errorMessage, useFeedback } from './Feedback'
import { LoadingHint } from './Skeleton'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

const RESULT: Record<
  SelfTestLogEntry['result'],
  { label: () => string; variant: 'success' | 'destructive' | 'secondary' }
> = {
  passed: { label: m.selftest_result_passed, variant: 'success' },
  failed: { label: m.selftest_result_failed, variant: 'destructive' },
  aborted: { label: m.selftest_result_aborted, variant: 'secondary' },
}

const KIND: Record<SelfTestLogEntry['kind'], () => string> = {
  short: m.selftest_short,
  long: m.selftest_long,
  other: () => '',
}

/**
 * "about 2 minutes", "about 19 hours"
 */
export const formatTestDuration = (minutes: number | undefined): string =>
  minutes === undefined
    ? ''
    : minutes < 90
      ? m.selftest_about_minutes({ count: Math.max(1, Math.round(minutes)) })
      : m.selftest_about_hours({ count: Math.round(minutes / 60) })

/**
 * When a logged test ran, from the disk's power-on hours then and now
 */
const ranAgo = (
  entryHours: number | undefined,
  nowHours: number | undefined,
) => {
  if (entryHours === undefined) return ''
  const at = m.selftest_at_hours({
    hours: entryHours.toLocaleString(getLocale()),
  })
  if (nowHours === undefined || nowHours < entryHours) return at
  const hours = nowHours - entryHours
  const ago =
    hours < 24
      ? m.selftest_hours_ago({ count: hours })
      : m.selftest_days_ago({ count: Math.round(hours / 24) })
  return `${ago} · ${at}`
}

interface SmartSelfTestProps {
  configPath: string
  test: DiskSelfTest | undefined
  loading: boolean
  powerOnHours?: number
  onRefresh: () => void
  refreshing: boolean
}

/**
 * Short and long self-tests of one disk: start, follow, stop, and the disk's log of past tests
 */
export const SmartSelfTest = ({
  configPath,
  test,
  loading,
  powerOnHours,
  onRefresh,
  refreshing,
}: SmartSelfTestProps) => {
  const { confirm, toast } = useFeedback()
  const job = useJob()
  const control = useControlSelfTests()

  if (loading) {
    return (
      <div className="p-5">
        <LoadingHint>{m.selftest_loading()}</LoadingHint>
      </div>
    )
  }
  if (!test) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        {m.selftest_no_device()}
      </p>
    )
  }

  const run = async (action: 'short' | 'long' | 'abort') => {
    if (action === 'long') {
      const confirmed = await confirm({
        title: m.selftest_long_confirm_title({ disk: test.disk }),
        message: m.selftest_long_confirm({
          duration: formatTestDuration(test.durations?.long),
        }),
        confirmLabel: m.selftest_start_long(),
      })
      if (!confirmed) return
    }
    control.mutate(
      { configPath, disks: [test.disk], action },
      {
        onSuccess: (failed) => {
          if (failed.length > 0) toast.error(failed[0].error)
          else if (action !== 'abort')
            toast.success(m.selftest_started({ disk: test.disk }))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const busy = control.isPending
  const blockedByJob = job.isRunning

  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {m.selftest_intro()}
      </p>

      {test.standby ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Moon className="size-4" />
          {m.selftest_standby()}
        </p>
      ) : !test.supported ? (
        <p className="text-sm text-muted-foreground">
          {m.selftest_unsupported()}
          {test.error && (
            <span className="mt-1 block font-mono text-xs">{test.error}</span>
          )}
        </p>
      ) : test.running ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {test.running.remainingPercent !== undefined
                ? m.selftest_running_remaining({
                    percent: test.running.remainingPercent,
                  })
                : m.selftest_running()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => run('abort')}
              disabled={busy}
            >
              <Square />
              {m.selftest_abort()}
            </Button>
          </div>
          {test.running.remainingPercent !== undefined && (
            <Progress
              value={100 - test.running.remainingPercent}
              aria-label={m.selftest_running()}
              indicatorClassName="ui-stripes bg-blue-600"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {m.selftest_running_hint()}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => run('short')}
            disabled={busy || blockedByJob}
          >
            <Play />
            {m.selftest_start_short()}
            {test.durations?.short !== undefined && (
              <span className="text-muted-foreground">
                ({formatTestDuration(test.durations.short)})
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => run('long')}
            disabled={busy || blockedByJob}
          >
            <Play />
            {m.selftest_start_long()}
            {test.durations?.long !== undefined && (
              <span className="text-muted-foreground">
                ({formatTestDuration(test.durations.long)})
              </span>
            )}
          </Button>
          {blockedByJob && (
            <span className="text-xs text-muted-foreground">
              {m.selftest_job_running()}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{m.selftest_log_title()}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
          {m.selftest_refresh()}
        </Button>
      </div>
      {test.log.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.selftest_log_empty()}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.selftest_col_test()}</TableHead>
                <TableHead>{m.selftest_col_result()}</TableHead>
                <TableHead>{m.selftest_col_when()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {test.log.map((entry, index) => (
                <TableRow
                  // The disk's log has no ids, its order is fixed
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries can repeat exactly
                  key={index}
                  className={cn(
                    entry.result === 'failed' &&
                      'bg-red-50/60 dark:bg-red-950/30',
                  )}
                >
                  <TableCell>
                    {KIND[entry.kind]() || entry.type}
                    {entry.kind !== 'other' && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {entry.type}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={RESULT[entry.result].variant}>
                      {RESULT[entry.result].label()}
                    </Badge>
                    {entry.result !== 'passed' && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {entry.status}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ranAgo(entry.powerOnHours, powerOnHours)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
