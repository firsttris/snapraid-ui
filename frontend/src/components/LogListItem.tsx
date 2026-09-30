import type { LogFile } from '@shared/types'
import { Trash2 } from 'lucide-react'
import {
  getCommandIcon,
  getCommandLabel,
  getCommandTone,
} from '../lib/commands'
import { getResultLabel, RESULT_ICONS } from '../lib/run-result'
import { formatDuration, formatFileSize, formatTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

interface LogListItemProps {
  log: LogFile
  isSelected: boolean
  isRunning: boolean
  // Only named when the logs come from more than one config
  configName?: string
  onSelect: (filename: string) => void
  onDelete: (filename: string) => void
}

// Only the results that need attention get a color, a list of green checks is noise
const RESULT_TEXT: Record<NonNullable<LogFile['result']>, string> = {
  ok: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
  aborted: 'text-gray-500',
  incomplete: 'text-gray-400',
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
  const Icon = getCommandIcon(log.command)
  const ResultIcon = log.result && RESULT_ICONS[log.result]
  const duration = runDuration(log)

  return (
    <div
      className={`group relative flex items-center transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      {isSelected && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-blue-600" />
      )}
      <button
        type="button"
        data-log={log.filename}
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onSelect(log.filename)}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${getCommandTone(log.command)}`}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900">
              {getCommandLabel(log.command)}
            </span>
            {isRunning ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-blue-600">
                <span className="relative flex h-2 w-2">
                  <span className="ui-ping absolute inset-0 rounded-full bg-blue-500" />
                  <span className="relative h-2 w-2 rounded-full bg-blue-600" />
                </span>
                {m.log_running()}
              </span>
            ) : (
              ResultIcon &&
              log.result && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${RESULT_TEXT[log.result]}`}
                  title={getResultLabel(log.result)}
                >
                  <ResultIcon size={14} />
                  {log.result !== 'ok' && getResultLabel(log.result)}
                </span>
              )
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500">
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
                <span>{formatDuration(duration)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{formatFileSize(log.size)}</span>
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
      </button>
      <button
        type="button"
        onClick={() => onDelete(log.filename)}
        disabled={isRunning}
        aria-label={m.log_delete_label({ filename: log.filename })}
        title={m.common_delete()}
        className="mr-2 rounded-md p-2 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 disabled:hidden group-hover:opacity-100 max-lg:opacity-100"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
