import type { LastRun, SnapRaidStatus } from '@shared/types'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Tooltip as ChartTooltip,
  LinearScale,
  type TooltipItem,
} from 'chart.js'
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Info,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Bar } from 'react-chartjs-2'
import { cn, SCRUB_OLDEST_STALE_DAYS, scrubKeepingUp } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Card } from './ui/card'

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip)

interface IntegrityReportProps {
  status: SnapRaidStatus
  lastScrub?: LastRun | null
}

type Tone = 'ok' | 'info' | 'warning' | 'error'
type Finding = { tone: Tone; title: string; message: string }

const TONE_ALERT: Record<Tone, 'success' | 'info' | 'warning' | 'destructive'> =
  {
    ok: 'success',
    info: 'info',
    warning: 'warning',
    error: 'destructive',
  }

const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleX,
}

const BAR_COLOR = 'rgb(59, 130, 246)'
const BAR_STALE_COLOR = 'rgb(249, 115, 22)'

// What needs attention, most severe first, each with the step that resolves it
const getFindings = (status: SnapRaidStatus, keepingUp: boolean): Finding[] => {
  const findings: Finding[] = []
  const badBlocks = status.badBlocks ?? 0

  if (status.hasErrors) {
    findings.push(
      badBlocks > 0
        ? {
            tone: 'error',
            title: m.status_modal_bad_blocks_title({ count: badBlocks }),
            message: m.status_modal_bad_blocks_msg(),
          }
        : {
            tone: 'error',
            title: m.status_modal_error_title(),
            message: m.status_modal_error_msg(),
          },
    )
  }
  if (status.syncIncomplete) {
    findings.push({
      tone: 'warning',
      title: m.status_modal_sync_incomplete_title(),
      message: m.status_modal_sync_incomplete_msg({
        count: (status.unsyncedBlocks ?? 0).toLocaleString(getLocale()),
      }),
    })
  } else if (!status.parityUpToDate && !status.hasErrors) {
    findings.push({
      tone: 'warning',
      title: m.status_modal_needs_sync_title(),
      message: m.status_modal_needs_sync_msg(),
    })
  }
  // Same rule and wording as the dashboard, so both agree: old blocks while
  // recent scrubs succeed are a backlog being worked off, not a problem
  const oldestStale = (status.oldestScrubDays ?? 0) > SCRUB_OLDEST_STALE_DAYS
  if (oldestStale && !keepingUp) {
    findings.push({
      tone: 'warning',
      title: m.health_attention_scrub(),
      message: m.health_hint_scrub_oldest({
        days: status.oldestScrubDays ?? 0,
      }),
    })
  }

  if (findings.length === 0) {
    findings.push({
      tone: 'ok',
      title: m.status_modal_ok_title(),
      message: m.status_modal_ok_msg(),
    })
  }
  if (oldestStale && keepingUp) {
    findings.push({
      tone: 'info',
      title: m.status_modal_backlog_title(),
      message: m.health_scrub_backlog(),
    })
  }
  return findings
}

// "vor 890 Tagen", "heute", "yesterday", ...
const formatDaysAgo = (days: number | undefined) =>
  days === undefined
    ? '–'
    : new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(
        -days,
        'day',
      )

const Stat = ({
  label,
  hint,
  highlight = false,
  children,
}: {
  label: string
  hint?: string
  highlight?: boolean
  children: ReactNode
}) => (
  <Card className="gap-0 p-3 shadow-none" title={hint}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={cn(
        'mt-1 text-lg font-semibold tabular-nums',
        highlight && 'text-orange-700',
      )}
    >
      {children}
    </p>
  </Card>
)

/**
 * What `snapraid status` says about the integrity of the array: findings with what to do, how
 * far scrub got, and how old the blocks are
 */
export function IntegrityReport({ status, lastScrub }: IntegrityReportProps) {
  const keepingUp = scrubKeepingUp(lastScrub)
  const findings = getFindings(status, keepingUp)
  const locale = getLocale()

  // Oldest blocks on the left, like the graph of `snapraid status`
  const history = [...(status.scrubHistory ?? [])].sort(
    (a, b) => b.daysAgo - a.daysAgo,
  )

  // Chart.js draws on a canvas, so it needs the theme's colors as values
  const themeColor = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const gridColor = themeColor('--color-gray-200')
  const tickColor = themeColor('--color-gray-500')
  ChartJS.defaults.font.family = getComputedStyle(document.body).fontFamily

  const chartData = {
    labels: history.map((point) => point.daysAgo.toLocaleString(locale)),
    datasets: [
      {
        data: history.map((point) => point.percentage),
        backgroundColor: history.map((point) =>
          point.daysAgo > SCRUB_OLDEST_STALE_DAYS ? BAR_STALE_COLOR : BAR_COLOR,
        ),
        borderRadius: 2,
        maxBarThickness: 32,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) =>
            formatDaysAgo(history[items[0]?.dataIndex ?? 0]?.daysAgo),
          label: (item: TooltipItem<'bar'>) =>
            m.status_modal_bar_tooltip({ percent: String(item.parsed.y) }),
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: tickColor,
          callback: (value: string | number) => `${value}%`,
        },
        grid: { color: gridColor },
      },
      x: {
        grid: { display: false },
        ticks: {
          color: tickColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        title: {
          display: true,
          text: m.status_modal_axis_days(),
          color: tickColor,
        },
      },
    },
  }

  return (
    <>
      <div className="space-y-2">
        {findings.map((finding) => {
          const Icon = TONE_ICON[finding.tone]
          return (
            <Alert key={finding.title} variant={TONE_ALERT[finding.tone]}>
              <Icon />
              <AlertTitle>{finding.title}</AlertTitle>
              <AlertDescription>{finding.message}</AlertDescription>
            </Alert>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={m.status_modal_oldest()}
          highlight={
            !keepingUp &&
            (status.oldestScrubDays ?? 0) > SCRUB_OLDEST_STALE_DAYS
          }
        >
          {formatDaysAgo(status.oldestScrubDays)}
        </Stat>
        <Stat label={m.status_modal_median()}>
          {formatDaysAgo(status.medianScrubDays)}
        </Stat>
        <Stat label={m.status_modal_newest()}>
          {formatDaysAgo(status.newestScrubDays)}
        </Stat>
        <Stat
          label={m.status_modal_scrubbed()}
          hint={m.status_modal_scrubbed_hint()}
        >
          {status.scrubPercentage === undefined
            ? '–'
            : `${status.scrubPercentage}%`}
        </Stat>
        <Stat
          label={m.status_modal_bad_blocks()}
          highlight={(status.badBlocks ?? 0) > 0}
        >
          {(status.badBlocks ?? 0).toLocaleString(locale)}
        </Stat>
        <Stat
          label={m.status_modal_unsynced_blocks()}
          highlight={(status.unsyncedBlocks ?? 0) > 0}
        >
          {status.unsyncedBlocks === undefined
            ? '–'
            : status.unsyncedBlocks.toLocaleString(locale)}
        </Stat>
      </div>

      {history.length > 0 && (
        <div>
          <h4 className="text-base font-semibold">
            {m.status_modal_scrub_age()}
          </h4>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            {m.status_modal_scrub_age_hint({
              days: String(SCRUB_OLDEST_STALE_DAYS),
            })}
          </p>
          <div className="h-64 rounded-lg border bg-card p-3">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {status.rawOutput.trim() && (
        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            {m.status_modal_raw_output()}
          </summary>
          <pre className="overflow-x-auto border-t bg-muted/50 p-4 font-mono text-xs">
            {status.rawOutput}
          </pre>
        </details>
      )}
    </>
  )
}
