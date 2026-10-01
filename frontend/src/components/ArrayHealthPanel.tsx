import type {
  LastRun,
  Schedule,
  SnapRaidCommand,
  SnapRaidStatus,
} from '@shared/types'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CircleHelp,
  FileText,
  Hourglass,
  Loader2,
  type LucideIcon,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getCommandDescription, getCommandLabel } from '../lib/commands'
import type { JobProgress } from '../lib/progress'
import { getResultLabel, RESULT_STYLES } from '../lib/run-result'
import {
  daysSince,
  formatRelativeTime,
  SCRUB_OLDEST_STALE_DAYS,
  SCRUB_STALE_DAYS,
  SYNC_STALE_DAYS,
} from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'
import { CommandMenu } from './CommandMenu'
import { RunningJobBox } from './RunningJobBox'
import { LoadingHint, Skeleton } from './Skeleton'

interface RunningJobInfo {
  command: string
  progress: JobProgress | null
  isAborting: boolean
}

interface ArrayHealthPanelProps {
  status: SnapRaidStatus | undefined
  isStatusLoading: boolean
  isStatusError: boolean
  isBusy: boolean
  statusTimestamp: string | undefined
  lastSync: LastRun | null | undefined
  lastScrub: LastRun | null | undefined
  nextSchedule: Schedule | undefined
  hasScrubSchedule: boolean // An enabled schedule scrubs this config, also as part of a sync
  isSchedulesLoading: boolean
  runningJob: RunningJobInfo | undefined // Job of this config that is running right now
  onRefresh: () => void
  onExecute: (command: SnapRaidCommand) => void
  onAbort: () => void
  onFixErrors: () => void
  onScrubBad: () => void
  onTouch: () => void
  actionsDisabled: boolean
}

type Health =
  | 'healthy'
  | 'attention'
  | 'sync_incomplete'
  | 'errors'
  | 'busy'
  | 'unknown'

const HEALTH_STYLES: Record<
  Health,
  { box: string; badge: string; icon: LucideIcon }
> = {
  healthy: {
    box: 'bg-green-50 border-green-200 text-green-800',
    badge: 'bg-green-500',
    icon: ShieldCheck,
  },
  attention: {
    box: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    badge: 'bg-yellow-500',
    icon: AlertTriangle,
  },
  sync_incomplete: {
    box: 'bg-orange-50 border-orange-200 text-orange-800',
    badge: 'bg-orange-500',
    icon: AlertTriangle,
  },
  errors: {
    box: 'bg-red-50 border-red-200 text-red-800',
    badge: 'bg-red-500',
    icon: ShieldAlert,
  },
  busy: {
    box: 'bg-blue-50 border-blue-200 text-blue-800',
    badge: 'bg-blue-500',
    icon: Loader2,
  },
  unknown: {
    box: 'bg-gray-50 border-gray-200 text-gray-700',
    badge: 'bg-gray-400',
    icon: CircleHelp,
  },
}

// Colored badge; a calm ring pulses while all is well, errors pulse to draw the eye
const HealthBadge = ({ health }: { health: Health }) => {
  const { badge, icon: Icon } = HEALTH_STYLES[health]
  const pulses = health === 'healthy' || health === 'errors'
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      {pulses && (
        <span className={`ui-ping absolute inset-0 rounded-full ${badge}`} />
      )}
      <span
        className={`relative flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm ${badge}`}
      >
        <Icon size={18} className={health === 'busy' ? 'animate-spin' : ''} />
      </span>
    </span>
  )
}

const getHealthTitle = (
  health: Health,
  syncOverdue: boolean,
  scrubOverdue: boolean,
): string => {
  switch (health) {
    case 'healthy':
      return m.health_healthy()
    case 'attention':
      return syncOverdue && scrubOverdue
        ? m.health_attention_both()
        : syncOverdue
          ? m.health_attention_sync()
          : m.health_attention_scrub()
    case 'sync_incomplete':
      return m.health_sync_incomplete()
    case 'errors':
      return m.health_errors()
    case 'busy':
      return m.health_busy()
    case 'unknown':
      return m.health_unknown()
  }
}

const getHealthMessage = (
  health: Health,
  status: SnapRaidStatus | undefined,
): string => {
  switch (health) {
    case 'healthy':
      return m.health_healthy_msg()
    case 'attention':
      // The overdue runs below explain themselves
      return ''
    case 'sync_incomplete':
      // Unsynced blocks come from the content file, a failed run from its log
      return status?.unsyncedBlocks
        ? m.health_sync_incomplete_blocks({ count: status.unsyncedBlocks })
        : m.health_sync_incomplete_msg()
    case 'errors':
      return m.health_errors_msg()
    case 'busy':
      return m.health_busy_msg()
    case 'unknown':
      return m.health_unknown_msg()
  }
}

// Overdue runs; the tiles flag them too, the hints add the action
const staleDays = (run: LastRun | null | undefined, limit: number) => {
  if (!run) return undefined
  const days = daysSince(run.timestamp)
  return days > limit ? Math.floor(days) : undefined
}

// Recent partial scrubs can leave old blocks behind, the status knows their age
const oldestBlockStale = (status: SnapRaidStatus | undefined) =>
  status?.oldestScrubDays !== undefined &&
  status.oldestScrubDays > SCRUB_OLDEST_STALE_DAYS
    ? status.oldestScrubDays
    : undefined

// Each scrub verifies the oldest blocks first, a few percent per run, so recent
// successful scrubs work off old blocks bit by bit and those need no warning
const scrubKeepingUp = (run: LastRun | null | undefined) =>
  !!run &&
  (run.result === 'ok' || run.result === 'warning') &&
  daysSince(run.timestamp) <= SCRUB_STALE_DAYS

const LogLink = ({ logFile }: { logFile: string }) => (
  <Link
    to="/logs"
    search={{ file: logFile }}
    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
    title={logFile}
  >
    <FileText size={12} />
    {m.health_view_log()}
  </Link>
)

interface Hint {
  key: string
  text: string
  actionLabel: string
  onAction: () => void
}

const HintRow = ({ hint, disabled }: { hint: Hint; disabled: boolean }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
    <span className="min-w-0 flex-1">{hint.text}</span>
    <Button
      onClick={hint.onAction}
      disabled={disabled}
      variant="secondary"
      size="sm"
      className="bg-white"
    >
      {hint.actionLabel}
    </Button>
  </div>
)

// Shape of a tile's value and its caption
const TileSkeleton = () => (
  <>
    <Skeleton className="mt-1.5 h-6 w-28" />
    <Skeleton className="mt-2 h-4 w-20" />
  </>
)

const Tile = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300">
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
  running,
  missingLabel,
  children,
}: {
  label: string
  run: LastRun | null | undefined
  staleDays: number
  running: boolean
  missingLabel: string // No log found, "never" or just cleaned up logs
  children?: ReactNode
}) => {
  if (running) {
    return (
      <Tile label={label}>
        <p className="flex items-center gap-2 text-lg font-semibold text-blue-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          {m.health_running_now()}
        </p>
        {run && (
          <p className="mt-1 text-xs text-gray-500">
            {m.health_previous_run({
              time: formatRelativeTime(run.timestamp, getLocale()),
              result: getResultLabel(run.result),
            })}
          </p>
        )}
        {children}
      </Tile>
    )
  }
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
        <p className="text-lg font-semibold text-gray-500">{missingLabel}</p>
        {children}
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
        <LogLink logFile={run.logFile} />
      </div>
      {children}
    </Tile>
  )
}

// Scrub coverage from the status: how much of the array was ever verified, and how long ago the oldest block
const ScrubCoverage = ({
  status,
  keepingUp,
  hasScrubSchedule,
}: {
  status: SnapRaidStatus | undefined
  keepingUp: boolean
  hasScrubSchedule: boolean
}) => {
  if (status?.scrubPercentage === undefined) return null
  const oldestStale = oldestBlockStale(status) !== undefined
  // Old blocks while scrubs run are a backlog being worked off, not a problem
  const backlog = oldestStale && keepingUp
  return (
    <div className="mt-3">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={status.scrubPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={m.health_scrubbed_share({
          percent: status.scrubPercentage,
        })}
      >
        <div
          className="h-full rounded-full bg-green-500 transition-[width] duration-500"
          style={{ width: `${status.scrubPercentage}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {m.health_scrubbed_share({ percent: status.scrubPercentage })}
        {status.oldestScrubDays !== undefined && (
          <>
            {' · '}
            <span
              className={
                oldestStale && !backlog ? 'font-medium text-orange-600' : ''
              }
            >
              {m.health_oldest_block({ days: status.oldestScrubDays })}
            </span>
          </>
        )}
      </p>
      {backlog && (
        <p className="mt-1 text-xs text-gray-500">
          {m.health_scrub_backlog()}
          {!hasScrubSchedule && (
            <>
              {' '}
              <Link to="/schedules" className="text-blue-600 hover:underline">
                {m.health_setup_schedule()} →
              </Link>
            </>
          )}
        </p>
      )}
    </div>
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
  hasScrubSchedule,
  isSchedulesLoading,
  runningJob,
  onRefresh,
  onExecute,
  onAbort,
  onFixErrors,
  onScrubBad,
  onTouch,
  actionsDisabled,
}: ArrayHealthPanelProps) => {
  // status only reads the content file, so it still looks healthy when the last
  // sync failed before recording new files
  const lastSyncFailed =
    !!lastSync && lastSync.result !== 'ok' && lastSync.result !== 'warning'
  const syncOverdue = staleDays(lastSync, SYNC_STALE_DAYS)
  const scrubOverdue = staleDays(lastScrub, SCRUB_STALE_DAYS)
  const keepingUp = scrubKeepingUp(lastScrub)
  const oldestOverdue = keepingUp ? undefined : oldestBlockStale(status)
  // While a job holds SnapRAID's lock the last known status (kept across reloads) stands in
  const health: Health = !status
    ? isBusy
      ? 'busy'
      : 'unknown'
    : isStatusError && !isBusy
      ? 'unknown'
      : status.hasErrors
        ? 'errors'
        : status.syncIncomplete || lastSyncFailed
          ? 'sync_incomplete'
          : syncOverdue !== undefined ||
              scrubOverdue !== undefined ||
              oldestOverdue !== undefined
            ? 'attention'
            : 'healthy'
  const badBlocks = health === 'errors' ? (status?.badBlocks ?? 0) : 0
  // Sync is the fix for most problems, it only stands out when it is due
  const syncDue =
    health === 'sync_incomplete' ||
    (health === 'attention' && syncOverdue !== undefined)

  // Overdue runs are the reason for 'attention', so they go into its box
  const overdue: Hint[] = []
  if (health === 'attention' && syncOverdue !== undefined) {
    overdue.push({
      key: 'sync',
      text: m.health_hint_sync_stale({ days: syncOverdue }),
      actionLabel: m.health_start_sync(),
      onAction: () => onExecute('sync'),
    })
  }
  if (
    health === 'attention' &&
    (scrubOverdue !== undefined || oldestOverdue !== undefined)
  ) {
    overdue.push({
      key: 'scrub',
      text:
        scrubOverdue !== undefined
          ? m.health_hint_scrub_stale({ days: scrubOverdue })
          : m.health_hint_scrub_oldest({ days: oldestOverdue ?? 0 }),
      actionLabel: m.health_start_scrub(),
      onAction: () => onExecute('scrub'),
    })
  }
  const hints: Hint[] = []
  if ((status?.zeroSubsecondFiles ?? 0) > 0) {
    hints.push({
      key: 'touch',
      text: m.health_zero_subsecond({ count: status?.zeroSubsecondFiles ?? 0 }),
      actionLabel: m.health_run_touch(),
      onAction: onTouch,
    })
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{m.health_title()}</h2>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            {statusTimestamp && (
              <span title={new Date(statusTimestamp).toLocaleString()}>
                {m.health_updated({
                  time: formatRelativeTime(statusTimestamp, getLocale()),
                })}
              </span>
            )}
            <Button
              onClick={onRefresh}
              disabled={!!runningJob || actionsDisabled || isStatusLoading}
              variant="ghost"
              size="iconSm"
              className="p-1"
              aria-label={m.health_refresh()}
              title={m.health_refresh()}
            >
              <RefreshCw
                size={14}
                className={isStatusLoading ? 'animate-spin' : ''}
              />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => onExecute('status')}
            disabled={!!runningJob || actionsDisabled}
            variant="secondary"
            size="sm"
            title={getCommandDescription('status')}
          >
            {getCommandLabel('status')}
          </Button>
          <Button
            onClick={() => onExecute('scrub')}
            disabled={!!runningJob || actionsDisabled}
            variant="secondary"
            size="sm"
            title={getCommandDescription('scrub')}
          >
            {getCommandLabel('scrub')}
          </Button>
          <Button
            onClick={() => onExecute('sync')}
            disabled={!!runningJob || actionsDisabled}
            variant={syncDue ? 'success' : 'secondary'}
            size="sm"
            title={getCommandDescription('sync')}
          >
            {getCommandLabel('sync')}
          </Button>
          <CommandMenu
            onSelect={onExecute}
            disabled={!!runningJob || actionsDisabled}
          />
        </div>
      </div>

      {runningJob ? (
        <RunningJobBox
          command={runningJob.command}
          progress={runningJob.progress}
          isAborting={runningJob.isAborting}
          onAbort={onAbort}
        />
      ) : isStatusLoading && !status ? (
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <LoadingHint>{m.health_loading()}</LoadingHint>
            <Skeleton className="h-4 w-2/3 max-w-md" />
          </div>
        </div>
      ) : (
        <div
          key={health}
          role="status"
          aria-live="polite"
          className={`ui-fade-in flex items-start gap-4 rounded-lg border p-4 ${HEALTH_STYLES[health].box}`}
        >
          <HealthBadge health={health} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {getHealthTitle(
                health,
                overdue.some((hint) => hint.key === 'sync'),
                overdue.some((hint) => hint.key === 'scrub'),
              )}
            </p>
            {getHealthMessage(health, status) && (
              <p className="text-sm">{getHealthMessage(health, status)}</p>
            )}
            {overdue.map((hint) => (
              <p key={hint.key} className="text-sm">
                {hint.text}
              </p>
            ))}
            {overdue.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {overdue.map((hint) => (
                  <Button
                    key={hint.key}
                    onClick={hint.onAction}
                    disabled={actionsDisabled}
                    variant="secondary"
                    size="sm"
                    className="bg-white"
                  >
                    {hint.actionLabel}
                  </Button>
                ))}
                {/* A single scrub covers a few percent, regular ones keep the array verified */}
                {overdue.some((hint) => hint.key === 'scrub') &&
                  !hasScrubSchedule &&
                  !isSchedulesLoading && (
                    <Link
                      to="/schedules"
                      className="px-1 text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {m.health_setup_schedule()} →
                    </Link>
                  )}
              </div>
            )}
            {isBusy && status && statusTimestamp && (
              <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                <Hourglass size={12} className="shrink-0" />
                {m.health_busy_stale({
                  time: formatRelativeTime(statusTimestamp, getLocale()),
                })}
              </p>
            )}
            {health === 'sync_incomplete' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => onExecute('sync')}
                  disabled={actionsDisabled}
                  variant="warning"
                  size="sm"
                >
                  {m.health_restart_sync()}
                </Button>
                {lastSyncFailed && <LogLink logFile={lastSync.logFile} />}
              </div>
            )}
            {badBlocks > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">
                  {m.health_bad_blocks({ count: badBlocks })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={onFixErrors}
                    disabled={actionsDisabled}
                    variant="danger"
                    size="sm"
                  >
                    {m.health_fix_errors()}
                  </Button>
                  <Button
                    onClick={onScrubBad}
                    disabled={actionsDisabled}
                    variant="dangerOutline"
                    size="sm"
                  >
                    {m.health_scrub_bad()}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!runningJob && hints.length > 0 && (
        <div className="mt-3 space-y-2">
          {hints.map((hint) => (
            <HintRow key={hint.key} hint={hint} disabled={actionsDisabled} />
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LastRunTile
          label={m.health_last_sync()}
          run={lastSync}
          staleDays={SYNC_STALE_DAYS}
          running={runningJob?.command === 'sync'}
          // A readable status needs a content file, so a sync ran before
          missingLabel={status ? m.health_no_log() : m.health_never()}
        />
        <LastRunTile
          label={m.health_last_scrub()}
          run={lastScrub}
          staleDays={SCRUB_STALE_DAYS}
          running={runningJob?.command === 'scrub'}
          missingLabel={
            status?.scrubPercentage ? m.health_no_log() : m.health_never()
          }
        >
          <ScrubCoverage
            status={status}
            keepingUp={keepingUp}
            hasScrubSchedule={hasScrubSchedule || isSchedulesLoading}
          />
        </LastRunTile>
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
                {nextSchedule.name} ({getCommandLabel(nextSchedule.command)})
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
