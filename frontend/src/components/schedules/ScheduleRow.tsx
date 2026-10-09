import type { Schedule } from '@shared/types'
import { Pencil, Play, SkipForward, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
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
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
  describeCron,
  describeScrubArgs,
  getOutcomeDetail,
  getOutcomeLabel,
  OUTCOME_VARIANTS,
} from './scheduleText'

interface ScheduleRowProps {
  schedule: Schedule
  configName: string
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onRun: () => void
  runDisabled: boolean // A job is running
  onSkipNext: () => void // Skip the next timed run, or take that back
}

const IconAction = ({
  label,
  onClick,
  destructive = false,
  disabled = false,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={destructive ? 'ghostDestructive' : 'ghost'}
        size="icon-sm"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(pressed && 'bg-accent text-accent-foreground')}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

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
  const isSync = schedule.command === 'sync'
  const human = describeCron(schedule.cronExpression)
  const outcome = schedule.lastOutcome
  const outcomeDetail = outcome && getOutcomeDetail(outcome)
  const toggleLabel = schedule.enabled
    ? m.schedules_disable()
    : m.schedules_enable()

  const formatRun = (date: string) => (
    <time dateTime={date} title={new Date(date).toLocaleString()}>
      {formatRelativeTime(date, getLocale())}
    </time>
  )

  return (
    <div className="flex items-start gap-3 p-4 sm:gap-4">
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

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{schedule.name}</span>
            <Badge variant="outline" className="font-mono">
              {schedule.command}
            </Badge>
            {isSync && schedule.touchBefore && (
              <Badge variant="outline">{m.schedules_chain_touch()}</Badge>
            )}
            {isSync && schedule.args?.includes('-h') && (
              <Badge variant="outline">{m.sync_pre_hash()}</Badge>
            )}
            {isSync && schedule.scrubAfter && (
              <Badge variant="outline">
                {m.schedules_chain_scrub()}
                <span className="font-normal text-muted-foreground">
                  · {describeScrubArgs(schedule.scrubAfter)}
                </span>
              </Badge>
            )}
            {schedule.command === 'scrub' && (
              <Badge
                variant="outline"
                title={schedule.args?.join(' ') || undefined}
              >
                {m.schedules_plan_badge({
                  plan: describeScrubArgs(schedule.args),
                })}
              </Badge>
            )}
            {!schedule.enabled && (
              <Badge variant="secondary">{m.schedules_disabled()}</Badge>
            )}
            {schedule.enabled && schedule.skipNext && (
              <Badge variant="warning">{m.schedules_skip_next_badge()}</Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {human}
              <code className="ml-1 font-mono text-xs text-foreground/80">
                {schedule.cronExpression}
              </code>
            </span>
            {isSync &&
              (schedule.maxDeletedFiles != null ? (
                <span>
                  {m.schedules_guard_summary({
                    count: schedule.maxDeletedFiles,
                  })}
                </span>
              ) : (
                <span className="text-yellow-800">
                  {m.schedules_guard_off()}
                </span>
              ))}
            {isSync && schedule.maxUpdatedFiles != null && (
              <span>
                {m.schedules_update_guard_summary({
                  count: schedule.maxUpdatedFiles,
                })}
              </span>
            )}
            <span className="min-w-0 truncate" title={schedule.configPath}>
              {m.schedules_field_config()}: {configName}
            </span>
          </div>

          {((schedule.enabled && schedule.nextRun) ||
            schedule.lastRun ||
            outcome) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {schedule.enabled && schedule.nextRun && (
                <span>
                  {m.schedules_next_run()}{' '}
                  <span className="font-medium text-foreground">
                    {formatRun(schedule.nextRun)}
                  </span>
                </span>
              )}
              {(schedule.lastRun || outcome) && (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {m.schedules_last_run()}
                  {schedule.lastRun && (
                    <span className="text-foreground">
                      {formatRun(schedule.lastRun)}
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
                  {outcome?.steps?.map((step) => (
                    <Badge
                      key={step.command}
                      variant={OUTCOME_VARIANTS[step.result]}
                      className="font-normal"
                    >
                      {getCommandLabel(step.command)}:{' '}
                      {getOutcomeLabel(step.result)}
                    </Badge>
                  ))}
                </span>
              )}
            </div>
          )}

          {outcomeDetail && (
            <p className="text-sm text-muted-foreground">{outcomeDetail}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex items-center">
          <IconAction
            label={m.schedules_run_now()}
            onClick={onRun}
            disabled={runDisabled}
          >
            <Play />
          </IconAction>
          <IconAction
            label={
              schedule.skipNext
                ? m.schedules_skip_next_undo()
                : m.schedules_skip_next()
            }
            onClick={onSkipNext}
            disabled={!schedule.enabled}
            pressed={!!schedule.skipNext}
          >
            <SkipForward />
          </IconAction>
          <IconAction label={m.common_edit()} onClick={onEdit}>
            <Pencil />
          </IconAction>
          <IconAction label={m.common_delete()} onClick={onDelete} destructive>
            <Trash2 />
          </IconAction>
        </div>
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
      </div>
    </div>
  )
}
