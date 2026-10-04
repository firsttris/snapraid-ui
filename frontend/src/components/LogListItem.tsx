import type { LogFile } from '@shared/types'
import { Loader2, Trash2 } from 'lucide-react'
import { getCommandLabel } from '../lib/commands'
import { getResultLabel, RESULT_ICONS } from '../lib/run-result'
import { cn, formatDuration, formatFileSize, formatTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface LogListItemProps {
  log: LogFile
  isSelected: boolean
  isRunning: boolean
  // Only named when the logs come from more than one config
  configName?: string
  onSelect: (filename: string) => void
  onDelete: (filename: string) => void
}

const RESULT_TEXT: Record<NonNullable<LogFile['result']>, string> = {
  ok: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
  aborted: 'text-muted-foreground',
  incomplete: 'text-muted-foreground',
}

// Only the results that need attention get a badge, a list of "successful" is noise
const RESULT_BADGE: Partial<
  Record<
    NonNullable<LogFile['result']>,
    'warning' | 'destructive' | 'secondary'
  >
> = {
  warning: 'warning',
  error: 'destructive',
  aborted: 'secondary',
  incomplete: 'secondary',
}

export const runDuration = (log: LogFile) =>
  log.modified
    ? new Date(log.modified).getTime() - new Date(log.timestamp).getTime()
    : undefined

export const LogListItem = ({
  log,
  isSelected,
  isRunning,
  configName,
  onSelect,
  onDelete,
}: LogListItemProps) => {
  const ResultIcon = log.result && RESULT_ICONS[log.result]
  const badge = log.result && RESULT_BADGE[log.result]
  const duration = runDuration(log)

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md transition-colors',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        data-log={log.filename}
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onSelect(log.filename)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          className="flex shrink-0"
          title={
            isRunning
              ? m.log_running()
              : log.result && getResultLabel(log.result)
          }
        >
          {isRunning ? (
            <Loader2 className="size-4 animate-spin text-blue-600" />
          ) : ResultIcon && log.result ? (
            <ResultIcon className={cn('size-4', RESULT_TEXT[log.result])} />
          ) : (
            <span className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {getCommandLabel(log.command)}
          </span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <time
              dateTime={log.timestamp}
              title={new Date(log.timestamp).toLocaleString()}
              className="tabular-nums"
            >
              {formatTime(log.timestamp, getLocale())}
            </time>
            {!isRunning && duration !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatDuration(duration)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatFileSize(log.size)}</span>
            {configName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate" title={log.configPath}>
                  {configName}
                </span>
              </>
            )}
          </span>
        </span>
        {isRunning ? (
          <Badge variant="info">{m.log_live()}</Badge>
        ) : (
          badge &&
          log.result && (
            <Badge variant={badge}>{getResultLabel(log.result)}</Badge>
          )
        )}
      </button>
      {!isRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghostDestructive"
              size="icon-sm"
              onClick={() => onDelete(log.filename)}
              aria-label={m.log_delete_label({ filename: log.filename })}
              className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{m.common_delete()}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
