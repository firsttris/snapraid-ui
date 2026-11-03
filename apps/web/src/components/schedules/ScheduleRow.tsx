import type { Schedule } from '@shared/types'
import {
  MoreHorizontal,
  Pencil,
  Play,
  ShieldCheck,
  SkipForward,
  Trash2,
} from 'lucide-react'
import {
  getCommandIcon,
  getCommandLabel,
  getCommandTone,
} from '../../lib/commands'
import { cn, formatRelativeTime } from '../../lib/utils'
import * as m from '../../paraglide/messages'
import { getLocale } from '../../paraglide/runtime'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
  describeCron,
  describeRoutine,
  getOutcomeDetail,
  getOutcomeLabel,
  OUTCOME_VARIANTS,
} from './scheduleText'

interface ScheduleRowProps {
  schedule: Schedule
  configName?: string // Only shown with more than one array
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onRun: () => void
  runDisabled: boolean // A job is running
  onSkipNext: () => void // Skip the next timed run, or take that back
}

// The limits of the sync guard, e.g. "Sync guard: 50 deleted, 100 changed"
const describeGuard = (schedule: Schedule) => {
  const limits = [
    schedule.maxDeletedFiles != null &&
      m.schedules_guard_deleted({ count: schedule.maxDeletedFiles }),
    schedule.maxUpdatedFiles != null &&
      m.schedules_guard_updated({ count: schedule.maxUpdatedFiles }),
  ].filter(Boolean)
  return limits.length > 0
    ? m.schedules_guard_short({ limits: limits.join(', ') })
    : undefined
}

export const ScheduleRow = ({
  schedule,
  configName,
  onEdit,
  onDelete,
  onToggle,
  onRun,
  runDisabled,
  onSkipNext,
}: ScheduleRowProps) => {
  const Icon = getCommandIcon(schedule.command)
  const routine = describeRoutine(schedule)
  const guard = schedule.command === 'sync' && describeGuard(schedule)
  const outcome = schedule.lastOutcome
  const outcomeDetail = outcome && getOutcomeDetail(outcome)
  // One badge for the whole run, the steps only when one of them did not succeed
  const failedSteps = outcome?.steps?.some((step) => step.result !== 'ok')
    ? outcome.steps
        .map(
          (step) =>
            `${getCommandLabel(step.command)}: ${getOutcomeLabel(step.result)}`,
        )
        .join(' · ')
    : undefined
  const toggleLabel = schedule.enabled
    ? m.schedules_disable()
    : m.schedules_enable()

  const formatRun = (date: string) => (
    <time dateTime={date} title={new Date(date).toLocaleString()}>
      {formatRelativeTime(date, getLocale())}
    </time>
  )

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
      <div
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 sm:gap-4',
          !schedule.enabled && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            schedule.enabled
              ? getCommandTone(schedule.command)
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words">{schedule.name}</span>
            {routine && (
              <span className="text-sm text-muted-foreground">{routine}</span>
            )}
            {!schedule.enabled && (
              <Badge variant="secondary">{m.schedules_disabled()}</Badge>
            )}
            {schedule.enabled && schedule.skipNext && (
              <Badge variant="warning">{m.schedules_skip_next_badge()}</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <span>
              {describeCron(schedule.cronExpression) ?? (
                <code className="font-mono text-xs text-foreground/80">
                  {schedule.cronExpression}
                </code>
              )}
            </span>
            {schedule.enabled && schedule.nextRun && (
              <span>
                · {m.schedules_next_run()}{' '}
                <span className="text-foreground">
                  {formatRun(schedule.nextRun)}
                </span>
              </span>
            )}
            {configName && (
              <span className="min-w-0 truncate" title={schedule.configPath}>
                · {configName}
              </span>
            )}
          </div>

          {guard && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="size-3.5 text-emerald-600" />
              {guard}
            </span>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {schedule.lastRun || outcome ? (
              <>
                {schedule.lastRun && (
                  <span>
                    {m.schedules_last_run()}{' '}
                    <span className="text-foreground">
                      {formatRun(schedule.lastRun)}
                    </span>
                  </span>
                )}
                {outcome && (
                  <Badge
                    variant={OUTCOME_VARIANTS[outcome.result]}
                    title={new Date(outcome.timestamp).toLocaleString()}
                  >
                    {getOutcomeLabel(outcome.result)}
                  </Badge>
                )}
                {failedSteps && <span>{failedSteps}</span>}
              </>
            ) : (
              <span>{m.schedules_never_run()}</span>
            )}
          </div>

          {outcomeDetail && (
            <p className="text-sm text-muted-foreground">{outcomeDetail}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRun}
          disabled={runDisabled}
        >
          <Play />
          {m.schedules_run_now()}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex h-8 items-center px-1">
              <Switch
                checked={schedule.enabled}
                onCheckedChange={onToggle}
                aria-label={toggleLabel}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{toggleLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.schedules_more_actions({ name: schedule.name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              {m.common_edit()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onSkipNext}
              disabled={!schedule.enabled}
            >
              <SkipForward />
              {schedule.skipNext
                ? m.schedules_skip_next_undo()
                : m.schedules_skip_next()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {m.common_delete()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
