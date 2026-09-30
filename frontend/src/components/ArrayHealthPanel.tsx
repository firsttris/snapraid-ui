import type {
  LastRun,
  RunResult,
  Schedule,
  SnapRaidStatus,
} from '@shared/types'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { daysSince, formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'
import { LoadingHint, Skeleton } from './Skeleton'

// A run older than this is flagged as overdue
const SYNC_STALE_DAYS = 7
const SCRUB_STALE_DAYS = 30

interface ArrayHealthPanelProps {
  status: SnapRaidStatus | undefined
  isStatusLoading: boolean
  isStatusError: boolean
  isBusy: boolean
  statusTimestamp: string | undefined
  lastSync: LastRun | null | undefined
  lastScrub: LastRun | null | undefined
  nextSchedule: Schedule | undefined
  isSchedulesLoading: boolean
  onRefresh: () => void
  onShowDetails: () => void
  onFixErrors: () => void
  onScrubBad: () => void
  onTouch: () => void
  refreshDisabled: boolean
}

type Health =
  | 'healthy'
  | 'needs_sync'
  | 'sync_failed'
  | 'errors'
  | 'busy'
  | 'unknown'

const HEALTH_STYLES: Record<Health, { box: string; icon: string }> = {
  healthy: { box: 'bg-green-50 border-green-200 text-green-800', icon: '✅' },
  needs_sync: {
    box: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: '⚠️',
  },
  sync_failed: {
    box: 'bg-orange-50 border-orange-200 text-orange-800',
    icon: '⚠️',
  },
  errors: { box: 'bg-red-50 border-red-200 text-red-800', icon: '❌' },
  busy: { box: 'bg-blue-50 border-blue-200 text-blue-800', icon: '⏳' },
  unknown: { box: 'bg-gray-50 border-gray-200 text-gray-700', icon: '❔' },
}

const getHealthText = (health: Health): [string, string] => {
  switch (health) {
    case 'healthy':
      return [m.health_healthy(), m.health_healthy_msg()]
    case 'needs_sync':
      return [m.health_needs_sync(), m.health_needs_sync_msg()]
    case 'sync_failed':
      return [m.health_sync_failed(), m.health_sync_failed_msg()]
    case 'errors':
      return [m.health_errors(), m.health_errors_msg()]
    case 'busy':
      return [m.health_busy(), m.health_busy_msg()]
    case 'unknown':
      return [m.health_unknown(), m.health_unknown_msg()]
  }
}

const RESULT_STYLES: Record<RunResult, string> = {
  ok: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-700',
  aborted: 'bg-gray-200 text-gray-700',
  incomplete: 'bg-gray-200 text-gray-700',
}

const getResultLabel = (result: RunResult): string => {
  switch (result) {
    case 'ok':
      return m.run_result_ok()
    case 'warning':
      return m.run_result_warning()
    case 'error':
      return m.run_result_error()
    case 'aborted':
      return m.run_result_aborted()
    case 'incomplete':
      return m.run_result_incomplete()
  }
}

// Shape of a tile's value and its caption
const TileSkeleton = () => (
  <>
    <Skeleton className="mt-1.5 h-6 w-28" />
    <Skeleton className="mt-2 h-4 w-20" />
  </>
)

const Tile = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-lg border border-gray-200 p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {label}
    </p>
    <div className="mt-1">{children}</div>
  </div>
)

const LastRunTile = ({
  label,
  run,
  staleDays,
}: {
  label: string
  run: LastRun | null | undefined
  staleDays: number
}) => {
  if (run === undefined) {
    return (
      <Tile label={label}>
        <TileSkeleton />
      </Tile>
    )
  }
  if (run === null) {
    return (
      <Tile label={label}>
        <p className="text-lg font-semibold text-gray-500">
          {m.health_never()}
        </p>
      </Tile>
    )
  }

  const isStale = daysSince(run.timestamp) > staleDays
  return (
    <Tile label={label}>
      <p
        className={`text-lg font-semibold ${isStale ? 'text-orange-600' : 'text-gray-900'}`}
        title={new Date(run.timestamp).toLocaleString()}
      >
        {formatRelativeTime(run.timestamp, getLocale())}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${RESULT_STYLES[run.result]}`}
        >
          {getResultLabel(run.result)}
        </span>
        {isStale && (
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            {m.health_stale()}
          </span>
        )}
      </div>
    </Tile>
  )
}

export const ArrayHealthPanel = ({
  status,
  isStatusLoading,
  isStatusError,
  isBusy,
  statusTimestamp,
  lastSync,
  lastScrub,
  nextSchedule,
  isSchedulesLoading,
  onRefresh,
  onShowDetails,
  onFixErrors,
  onScrubBad,
  onTouch,
  refreshDisabled,
}: ArrayHealthPanelProps) => {
  // status only reads the content file, so it still looks healthy when the last
  // sync failed before recording new files
  const lastSyncFailed =
    !!lastSync && lastSync.result !== 'ok' && lastSync.result !== 'warning'
  // While a job holds SnapRAID's lock the last known status (kept across reloads) stands in
  const health: Health = !status
    ? isBusy
      ? 'busy'
      : 'unknown'
    : isStatusError && !isBusy
      ? 'unknown'
      : status.hasErrors
        ? 'errors'
        : !status.parityUpToDate
          ? 'needs_sync'
          : lastSyncFailed
            ? 'sync_failed'
            : 'healthy'
  const [title, message] = getHealthText(health)
  const badBlocks = health === 'errors' ? (status?.badBlocks ?? 0) : 0

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{m.health_title()}</h2>
        <div className="flex gap-2">
          <Button
            onClick={onShowDetails}
            disabled={!status}
            variant="secondary"
            size="sm"
          >
            {m.health_details()}
          </Button>
          <Button
            onClick={onRefresh}
            disabled={refreshDisabled || isStatusLoading}
            variant="secondary"
            size="iconSm"
            aria-label={m.health_refresh()}
            title={m.health_refresh()}
          >
            <RefreshCw
              size={16}
              className={isStatusLoading ? 'animate-spin' : ''}
            />
          </Button>
        </div>
      </div>

      {isStatusLoading && !status ? (
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <LoadingHint>{m.health_loading()}</LoadingHint>
            <Skeleton className="h-4 w-2/3 max-w-md" />
          </div>
        </div>
      ) : (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${HEALTH_STYLES[health].box}`}
        >
          <span className="text-2xl leading-none">
            {HEALTH_STYLES[health].icon}
          </span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm">{message}</p>
            {isBusy && status && statusTimestamp && (
              <p className="mt-1 text-xs opacity-80">
                ⏳{' '}
                {m.health_busy_stale({
                  time: formatRelativeTime(statusTimestamp, getLocale()),
                })}
              </p>
            )}
            {badBlocks > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">
                  {m.health_bad_blocks({ count: badBlocks })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onFixErrors}
                    disabled={refreshDisabled}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {m.health_fix_errors()}
                  </button>
                  <button
                    type="button"
                    onClick={onScrubBad}
                    disabled={refreshDisabled}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {m.health_scrub_bad()}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(status?.zeroSubsecondFiles ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span>
            {m.health_zero_subsecond({
              count: status?.zeroSubsecondFiles ?? 0,
            })}
          </span>
          <Button
            onClick={onTouch}
            disabled={refreshDisabled}
            variant="secondary"
            size="sm"
            className="bg-white"
          >
            {m.health_run_touch()}
          </Button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LastRunTile
          label={m.health_last_sync()}
          run={lastSync}
          staleDays={SYNC_STALE_DAYS}
        />
        <LastRunTile
          label={m.health_last_scrub()}
          run={lastScrub}
          staleDays={SCRUB_STALE_DAYS}
        />
        <Tile label={m.health_scrub_coverage()}>
          {isStatusLoading && !status ? (
            <TileSkeleton />
          ) : status?.scrubPercentage !== undefined ? (
            <>
              <p className="text-lg font-semibold text-gray-900">
                {status.scrubPercentage}%
              </p>
              {status.oldestScrubDays !== undefined && (
                <p className="text-xs text-gray-500">
                  {m.health_oldest_block({ days: status.oldestScrubDays })}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg font-semibold text-gray-400">–</p>
          )}
        </Tile>
        <Tile label={m.health_next_job()}>
          {isSchedulesLoading ? (
            <TileSkeleton />
          ) : nextSchedule?.nextRun ? (
            <>
              <p
                className="text-lg font-semibold text-gray-900"
                title={new Date(nextSchedule.nextRun).toLocaleString()}
              >
                {formatRelativeTime(nextSchedule.nextRun, getLocale())}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {nextSchedule.name} ({nextSchedule.command})
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-500">
                {m.health_no_schedule()}
              </p>
              <Link
                to="/schedules"
                className="text-xs text-blue-600 hover:underline"
              >
                {m.health_setup_schedule()} →
              </Link>
            </>
          )}
        </Tile>
      </div>
    </div>
  )
}
