import type {
  LastRun,
  RunResult,
  Schedule,
  SnapRaidStatus,
} from '@shared/types'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { daysSince, formatGB, formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

// A run older than this is flagged as overdue
const SYNC_STALE_DAYS = 7
const SCRUB_STALE_DAYS = 30

interface ArrayHealthPanelProps {
  status: SnapRaidStatus | undefined
  isStatusLoading: boolean
  isStatusError: boolean
  lastSync: LastRun | null | undefined
  lastScrub: LastRun | null | undefined
  nextSchedule: Schedule | undefined
  onRefresh: () => void
  onShowDetails: () => void
  refreshDisabled: boolean
}

type Health = 'healthy' | 'needs_sync' | 'sync_failed' | 'errors' | 'unknown'

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
        <p className="text-lg font-semibold text-gray-400">…</p>
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

const usageColor = (percent: number) => {
  if (percent >= 95) return 'bg-red-500'
  if (percent >= 85) return 'bg-yellow-500'
  return 'bg-blue-500'
}

export const ArrayHealthPanel = ({
  status,
  isStatusLoading,
  isStatusError,
  lastSync,
  lastScrub,
  nextSchedule,
  onRefresh,
  onShowDetails,
  refreshDisabled,
}: ArrayHealthPanelProps) => {
  // status only reads the content file, so it still looks healthy when the last
  // sync failed before recording new files
  const lastSyncFailed =
    !!lastSync && lastSync.result !== 'ok' && lastSync.result !== 'warning'
  const health: Health =
    !status || isStatusError
      ? 'unknown'
      : status.hasErrors
        ? 'errors'
        : !status.parityUpToDate
          ? 'needs_sync'
          : lastSyncFailed
            ? 'sync_failed'
            : 'healthy'
  const [title, message] = getHealthText(health)
  const disks = status?.disks ?? []

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{m.health_title()}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShowDetails}
            disabled={!status}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {m.health_details()}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled || isStatusLoading}
            className="p-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={m.health_refresh()}
            title={m.health_refresh()}
          >
            <RefreshCw
              size={16}
              className={isStatusLoading ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </div>

      {isStatusLoading && !status ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-600">
          {m.health_loading()}
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
          </div>
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
          {status?.scrubPercentage !== undefined ? (
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
          {nextSchedule?.nextRun ? (
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

      {disks.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            {m.health_disk_usage()}
          </h3>
          <div className="space-y-3">
            {disks.map((disk) => (
              <div key={disk.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-gray-800">{disk.name}</span>
                  <span className="text-gray-500">
                    {disk.usePercent}% ·{' '}
                    {m.health_free({ free: formatGB(disk.freeGB) })}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${usageColor(disk.usePercent)}`}
                    style={{ width: `${Math.min(disk.usePercent, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
