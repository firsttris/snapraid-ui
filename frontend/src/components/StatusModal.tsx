import type { SnapRaidStatus } from '@shared/types'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js'
import { RefreshCw, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { SCRUB_STALE_DAYS } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface StatusModalProps {
  status: SnapRaidStatus
  onClose: () => void
  onRefresh?: () => Promise<unknown>
}

type Tone = 'ok' | 'warning' | 'error'
type Finding = { tone: Tone; title: string; message: string }

const TONE_BOX: Record<Tone, string> = {
  ok: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
}

const TONE_ICON: Record<Tone, string> = { ok: '✅', warning: '⚠️', error: '❌' }

const BAR_COLOR = 'rgb(59, 130, 246)'
const BAR_STALE_COLOR = 'rgb(249, 115, 22)'

// What needs attention, most severe first, each with the step that resolves it
const getFindings = (status: SnapRaidStatus): Finding[] => {
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
  if ((status.oldestScrubDays ?? 0) > SCRUB_STALE_DAYS) {
    findings.push({
      tone: 'warning',
      title: m.status_modal_scrub_stale_title(),
      message: m.status_modal_scrub_stale_msg({
        days: String(status.oldestScrubDays),
      }),
    })
  }

  return findings.length > 0
    ? findings
    : [
        {
          tone: 'ok',
          title: m.status_modal_ok_title(),
          message: m.status_modal_ok_msg(),
        },
      ]
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
  <div className="rounded-lg border border-gray-200 p-3" title={hint}>
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {label}
    </p>
    <p
      className={`mt-1 text-lg font-semibold ${highlight ? 'text-orange-600' : 'text-gray-900'}`}
    >
      {children}
    </p>
  </div>
)

// Keeps Tab inside the dialog and closes it on Escape
const useDialogKeys = (
  dialogRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) => {
  // Latest onClose without re-running the effect, which would move the focus
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), summary, [href], [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [dialogRef])
}

export function StatusModal({ status, onClose, onRefresh }: StatusModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  useDialogKeys(dialogRef, onClose)

  const refresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh?.()
    } finally {
      setIsRefreshing(false)
    }
  }

  const findings = getFindings(status)
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
          point.daysAgo > SCRUB_STALE_DAYS ? BAR_STALE_COLOR : BAR_COLOR,
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
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut, Escape closes too
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-6">
          <div>
            <h3 id="status-modal-title" className="text-xl font-semibold">
              {m.status_modal_title()}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {m.status_modal_description()}
            </p>
          </div>
          <div className="flex gap-1">
            {onRefresh && (
              <Button
                onClick={refresh}
                disabled={isRefreshing}
                variant="ghost"
                size="icon"
                aria-label={m.status_modal_refresh()}
                title={m.status_modal_refresh()}
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? 'animate-spin' : ''}
                />
              </Button>
            )}
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              aria-label={m.common_close()}
              title={m.common_close()}
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-2">
            {findings.map((finding) => (
              <div
                key={finding.title}
                className={`flex items-start gap-3 rounded-lg border p-3 ${TONE_BOX[finding.tone]}`}
              >
                <span className="text-lg leading-6">
                  {TONE_ICON[finding.tone]}
                </span>
                <div>
                  <p className="font-semibold">{finding.title}</p>
                  <p className="text-sm">{finding.message}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label={m.status_modal_oldest()}
              highlight={(status.oldestScrubDays ?? 0) > SCRUB_STALE_DAYS}
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
              <h4 className="font-semibold">{m.status_modal_scrub_age()}</h4>
              <p className="mt-1 mb-3 text-sm text-gray-600">
                {m.status_modal_scrub_age_hint({
                  days: String(SCRUB_STALE_DAYS),
                })}
              </p>
              <div className="h-56 rounded-lg border border-gray-200 p-3">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {status.rawOutput.trim() && (
            <details className="rounded-lg border border-gray-200">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
                {m.status_modal_raw_output()}
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-800">
                {status.rawOutput}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
