import type {
  JobProgress,
  LastRun,
  Schedule,
  SnapRaidCommand,
  SnapRaidStatus,
} from '@shared/types'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarClock,
  CircleHelp,
  FileText,
  Hourglass,
  Info,
  Loader2,
  type LucideIcon,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getCommandDescription, getCommandLabel } from '../lib/commands'
import { getResultLabel } from '../lib/run-result'
import {
  cn,
  daysSince,
  formatRelativeTime,
  SCRUB_OLDEST_STALE_DAYS,
  SCRUB_STALE_DAYS,
  SYNC_STALE_DAYS,
  scrubKeepingUp,
} from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { CommandMenu } from './CommandMenu'
import { RunningJobBox } from './RunningJobBox'
import { LoadingHint, Skeleton } from './Skeleton'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

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
  {
    tile: string
    ping: string
    value: string
    alert: 'warning' | 'destructive' | 'info' | 'default'
    icon: LucideIcon
  }
> = {
  healthy: {
    tile: 'bg-green-50 text-green-700',
    ping: 'bg-green-500',
    value: '',
    alert: 'default',
    icon: ShieldCheck,
  },
  attention: {
    tile: 'bg-yellow-50 text-yellow-800',
    ping: 'bg-yellow-500',
    value: 'text-yellow-800',
    alert: 'warning',
    icon: AlertTriangle,
  },
  sync_incomplete: {
    tile: 'bg-orange-50 text-orange-700',
    ping: 'bg-orange-500',
    value: 'text-orange-700',
    alert: 'warning',
    icon: AlertTriangle,
  },
  errors: {
    tile: 'bg-red-50 text-red-700',
    ping: 'bg-red-500',
    value: 'text-red-700',
    alert: 'destructive',
    icon: ShieldAlert,
  },
  busy: {
    tile: 'bg-blue-50 text-blue-700',
    ping: 'bg-blue-500',
    value: 'text-blue-700',
    alert: 'info',
    icon: Loader2,
  },
  unknown: {
    tile: 'bg-muted text-muted-foreground',
    ping: 'bg-gray-400',
    value: 'text-muted-foreground',
    alert: 'default',
    icon: CircleHelp,
  },
}

// Tinted icon; a calm ring pulses while all is well, errors pulse to draw the eye
const HealthBadge = ({ health }: { health: Health }) => {
  const { tile, ping, icon: Icon } = HEALTH_STYLES[health]
  const pulses = health === 'healthy' || health === 'errors'
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center">
      {pulses && (
        <span className={`ui-ping absolute inset-0 rounded-lg ${ping}`} />
      )}
      <span
        className={`relative flex size-8 items-center justify-center rounded-lg ${tile}`}
      >
        <Icon className={cn('size-4', health === 'busy' && 'animate-spin')} />
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

interface HealthInput {
  status: SnapRaidStatus | undefined
  isStatusError: boolean
  isBusy: boolean
  lastSync: LastRun | null | undefined
  lastScrub: LastRun | null | undefined
}

/**
 * Overall state of the array from the status and the last runs, shared by the
 * panel and the page's command buttons
 */
export const getArrayHealth = ({
  status,
  isStatusError,
  isBusy,
  lastSync,
  lastScrub,
}: HealthInput) => {
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
  // Sync is the fix for most problems, it only stands out when it is due
  const syncDue =
    health === 'sync_incomplete' ||
    (health === 'attention' && syncOverdue !== undefined)
  return {
    health,
    lastSyncFailed,
    syncOverdue,
    scrubOverdue,
    oldestOverdue,
    keepingUp,
    syncDue,
  }
}

/**
 * Status, scrub, sync and the menu of the other commands, for the page header
 */
export const DashboardActions = ({
  onExecute,
  disabled,
  syncDue,
}: {
  onExecute: (command: SnapRaidCommand) => void
  disabled: boolean
  syncDue: boolean
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button
      onClick={() => onExecute('status')}
      disabled={disabled}
      variant="outline"
      title={getCommandDescription('status')}
    >
      {getCommandLabel('status')}
    </Button>
    <Button
      onClick={() => onExecute('scrub')}
      disabled={disabled}
      variant="outline"
      title={getCommandDescription('scrub')}
    >
      {getCommandLabel('scrub')}
    </Button>
    <Button
      onClick={() => onExecute('sync')}
      disabled={disabled}
      variant={syncDue ? 'success' : 'default'}
      title={getCommandDescription('sync')}
    >
      <RefreshCw />
      {getCommandLabel('sync')}
    </Button>
    <CommandMenu onSelect={onExecute} disabled={disabled} />
  </div>
)

/**
 * Age of the shown status with a button to read it again, for the page description
 */
export const StatusAge = ({
  timestamp,
  isLoading,
  disabled,
  onRefresh,
}: {
  timestamp: string | undefined
  isLoading: boolean
  disabled: boolean
  onRefresh: () => void
}) => (
  <span className="flex items-center gap-1">
    {timestamp && (
      <span title={new Date(timestamp).toLocaleString()}>
        {m.health_updated({
          time: formatRelativeTime(timestamp, getLocale()),
        })}
      </span>
    )}
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={onRefresh}
          disabled={disabled || isLoading}
          variant="ghost"
          size="icon-sm"
          className="size-7"
          aria-label={m.health_refresh()}
        >
          <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{m.health_refresh()}</TooltipContent>
    </Tooltip>
  </span>
)

const LogLink = ({ logFile }: { logFile: string }) => (
  <Link
    to="/logs"
    search={{ file: logFile }}
    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
  <Alert variant="info">
    <Info />
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-inherit">
      <span className="min-w-0 flex-1">{hint.text}</span>
      <Button
        onClick={hint.onAction}
        disabled={disabled}
        variant="outline"
        size="sm"
      >
        {hint.actionLabel}
      </Button>
    </AlertDescription>
  </Alert>
)

// Shape of a tile's value and its caption
const TileSkeleton = () => (
  <>
    <Skeleton className="h-7 w-28" />
    <Skeleton className="h-4 w-20" />
  </>
)

const Tile = ({
  label,
  corner,
  children,
}: {
  label: string
  corner?: ReactNode // Badge or icon at the top right
  children: ReactNode
}) => (
  <Card lift className="min-w-0 gap-2 p-[18px]">
    <div className="flex min-h-6 items-center justify-between gap-2">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      {corner}
    </div>
    {children}
  </Card>
)

const TileValue = ({
  className,
  title,
  children,
}: {
  className?: string
  title?: string
  children: ReactNode
}) => (
  <p
    className={cn('text-[22px] font-semibold tracking-tight', className)}
    title={title}
  >
    {children}
  </p>
)

const TileCaption = ({ children }: { children: ReactNode }) => (
  <div className="text-[13px] text-muted-foreground">{children}</div>
)

const RESULT_BADGE: Record<
  LastRun['result'],
  'success' | 'warning' | 'destructive' | 'secondary'
> = {
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  aborted: 'secondary',
  incomplete: 'secondary',
}

const LastRunTile = ({
  label,
  icon: Icon,
  run,
  staleDays,
  running,
  missingLabel,
  children,
}: {
  label: string
  icon: LucideIcon
  run: LastRun | null | undefined
  staleDays: number
  running: boolean
  missingLabel: string // No log found, "never" or just cleaned up logs
  children?: ReactNode
}) => {
  const idleIcon = <Icon className="size-4 text-muted-foreground" />
  if (running) {
    return (
      <Tile label={label} corner={idleIcon}>
        <TileValue className="flex items-center gap-2 text-blue-700">
          <span className="size-2 animate-pulse rounded-full bg-blue-600" />
          {m.health_running_now()}
        </TileValue>
        {run && (
          <TileCaption>
            {m.health_previous_run({
              time: formatRelativeTime(run.timestamp, getLocale()),
              result: getResultLabel(run.result),
            })}
          </TileCaption>
        )}
        {children}
      </Tile>
    )
  }
  if (run === undefined) {
    return (
      <Tile label={label} corner={idleIcon}>
        <TileSkeleton />
      </Tile>
    )
  }
  if (run === null) {
    return (
      <Tile label={label} corner={idleIcon}>
        <TileValue className="text-muted-foreground">{missingLabel}</TileValue>
        {children}
      </Tile>
    )
  }

  const isStale = daysSince(run.timestamp) > staleDays
  return (
    <Tile
      label={label}
      corner={
        <Badge variant={RESULT_BADGE[run.result]}>
          {getResultLabel(run.result)}
        </Badge>
      }
    >
      <TileValue
        className={isStale ? 'text-orange-700' : undefined}
        title={new Date(run.timestamp).toLocaleString()}
      >
        {formatRelativeTime(run.timestamp, getLocale())}
      </TileValue>
      <div className="flex flex-wrap items-center gap-1">
        {isStale && <Badge variant="warning">{m.health_stale()}</Badge>}
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
    <div className="space-y-1.5">
      <div
        className="h-1.5 rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={status.scrubPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={m.health_scrubbed_share({
          percent: status.scrubPercentage,
        })}
      >
        <div
          className="ui-bar h-full rounded-full bg-green-500 transition-[width] duration-500"
          style={{ width: `${status.scrubPercentage}%` }}
        />
      </div>
      <TileCaption>
        {m.health_scrubbed_share({ percent: status.scrubPercentage })}
        {status.oldestScrubDays !== undefined && (
          <>
            {' · '}
            <span
              className={
                oldestStale && !backlog ? 'font-medium text-orange-700' : ''
              }
            >
              {m.health_oldest_block({ days: status.oldestScrubDays })}
            </span>
          </>
        )}
      </TileCaption>
      {backlog && (
        <TileCaption>
          {m.health_scrub_backlog()}
          {!hasScrubSchedule && (
            <>
              {' '}
              <Link
                to="/schedules"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {m.health_setup_schedule()} →
              </Link>
            </>
          )}
        </TileCaption>
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
  onExecute,
  onAbort,
  onFixErrors,
  onScrubBad,
  onTouch,
  actionsDisabled,
}: ArrayHealthPanelProps) => {
  const {
    health,
    lastSyncFailed,
    syncOverdue,
    scrubOverdue,
    oldestOverdue,
    keepingUp,
  } = getArrayHealth({ status, isStatusError, isBusy, lastSync, lastScrub })
  const badBlocks = health === 'errors' ? (status?.badBlocks ?? 0) : 0

  // Overdue runs are the reason for 'attention', so they go into its notice
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

  const isLoading = isStatusLoading && !status
  const message = getHealthMessage(health, status)
  // Problems with something to do get a notice below the job, the tile keeps the headline
  const hasNotice =
    !runningJob &&
    !isLoading &&
    (overdue.length > 0 || health === 'sync_incomplete' || badBlocks > 0)
  const HealthIcon = HEALTH_STYLES[health].icon

  return (
    <>
      {runningJob && (
        <RunningJobBox
          command={runningJob.command}
          progress={runningJob.progress}
          isAborting={runningJob.isAborting}
          onAbort={onAbort}
        />
      )}

      {hasNotice && (
        <Alert
          key={health}
          variant={HEALTH_STYLES[health].alert}
          className="ui-fade-in"
          aria-live="polite"
        >
          <HealthIcon />
          <AlertTitle className="font-semibold">
            {getHealthTitle(
              health,
              overdue.some((hint) => hint.key === 'sync'),
              overdue.some((hint) => hint.key === 'scrub'),
            )}
          </AlertTitle>
          <AlertDescription className="text-inherit">
            {message && <p>{message}</p>}
            {overdue.map((hint) => (
              <p key={hint.key}>{hint.text}</p>
            ))}
            {overdue.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {overdue.map((hint) => (
                  <Button
                    key={hint.key}
                    onClick={hint.onAction}
                    disabled={actionsDisabled}
                    variant="outline"
                    size="sm"
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
                      className="px-1 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {m.health_setup_schedule()} →
                    </Link>
                  )}
              </div>
            )}
            {health === 'sync_incomplete' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => onExecute('sync')}
                  disabled={actionsDisabled}
                  variant="warning"
                  size="sm"
                >
                  {m.health_restart_sync()}
                </Button>
                {lastSyncFailed && lastSync && (
                  <LogLink logFile={lastSync.logFile} />
                )}
              </div>
            )}
            {badBlocks > 0 && (
              <div className="mt-1">
                <p className="font-medium">
                  {m.health_bad_blocks({ count: badBlocks })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={onFixErrors}
                    disabled={actionsDisabled}
                    variant="destructive"
                    size="sm"
                  >
                    {m.health_fix_errors()}
                  </Button>
                  <Button
                    onClick={onScrubBad}
                    disabled={actionsDisabled}
                    variant="destructiveOutline"
                    size="sm"
                  >
                    {m.health_scrub_bad()}
                  </Button>
                </div>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!runningJob &&
        hints.map((hint) => (
          <HintRow key={hint.key} hint={hint} disabled={actionsDisabled} />
        ))}

      {/* Two by two on tablets and next to a sidebar, in one row once there is room */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
          <Tile
            label={m.health_title()}
            corner={!isLoading && <HealthBadge health={health} />}
          >
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-28" />
                <LoadingHint>{m.health_loading()}</LoadingHint>
              </>
            ) : (
              <div key={health} role="status" className="ui-fade-in space-y-2">
                <TileValue className={HEALTH_STYLES[health].value}>
                  {getHealthTitle(
                    health,
                    overdue.some((hint) => hint.key === 'sync'),
                    overdue.some((hint) => hint.key === 'scrub'),
                  )}
                </TileValue>
                {!hasNotice && message && <TileCaption>{message}</TileCaption>}
                {isBusy && status && statusTimestamp && (
                  <TileCaption>
                    <span className="flex items-center gap-1">
                      <Hourglass className="size-3 shrink-0" />
                      {m.health_busy_stale({
                        time: formatRelativeTime(statusTimestamp, getLocale()),
                      })}
                    </span>
                  </TileCaption>
                )}
              </div>
            )}
          </Tile>
          <LastRunTile
            label={m.health_last_sync()}
            icon={RefreshCw}
            run={lastSync}
            staleDays={SYNC_STALE_DAYS}
            running={runningJob?.command === 'sync'}
            // A readable status needs a content file, so a sync ran before
            missingLabel={status ? m.health_no_log() : m.health_never()}
          />
          <LastRunTile
            label={m.health_last_scrub()}
            icon={ScanSearch}
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
          <Tile
            label={m.health_next_job()}
            corner={<CalendarClock className="size-4 text-muted-foreground" />}
          >
            {isSchedulesLoading ? (
              <TileSkeleton />
            ) : nextSchedule?.nextRun ? (
              <>
                <TileValue
                  title={new Date(nextSchedule.nextRun).toLocaleString()}
                >
                  {formatRelativeTime(nextSchedule.nextRun, getLocale())}
                </TileValue>
                <TileCaption>
                  <p className="truncate">
                    {nextSchedule.name} ({getCommandLabel(nextSchedule.command)}
                    )
                  </p>
                </TileCaption>
              </>
            ) : (
              <>
                <TileValue className="text-muted-foreground">
                  {m.health_no_schedule()}
                </TileValue>
                <Link
                  to="/schedules"
                  className="text-[13px] font-medium underline-offset-4 hover:underline"
                >
                  {m.health_setup_schedule()} →
                </Link>
              </>
            )}
          </Tile>
        </div>
      </div>
    </>
  )
}
