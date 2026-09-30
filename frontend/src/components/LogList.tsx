import type { LogFile, SnapRaidCommand } from '@shared/types'
import { FilterX, ScrollText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDeleteLog, useLogs } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import { getCommandLabel } from '../lib/commands'
import { getResultLabel } from '../lib/run-result'
import { dayKey, formatDayHeading } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'
import { errorMessage, useFeedback } from './Feedback'
import { type CommandFilter, LogFilters } from './LogFilters'
import { LogListItem } from './LogListItem'
import { Skeleton } from './Skeleton'

export const isProblem = (log: LogFile) =>
  log.result === 'warning' || log.result === 'error' || log.result === 'aborted'

const configName = (path: string | undefined) =>
  path
    ?.split('/')
    .pop()
    ?.replace(/\.conf$/, '')

/**
 * Deletes a log after asking, and moves the selection to its neighbour
 */
export const useDeleteLogAction = (
  selectedLog: string | null,
  onSelectLog: (filename: string | null) => void,
) => {
  const { confirm, toast } = useFeedback()
  const { data: logs = [] } = useLogs()
  const deleteLog = useDeleteLog()

  return async (filename: string) => {
    const confirmed = await confirm({
      title: m.logs_delete_title(),
      message: m.logs_delete_confirm({ filename }),
      confirmLabel: m.confirm_delete(),
      danger: true,
    })
    if (!confirmed) return

    const index = logs.findIndex((log) => log.filename === filename)
    const neighbour = logs[index + 1] ?? logs[index - 1]
    deleteLog.mutate(filename, {
      onSuccess: () => {
        if (selectedLog === filename) onSelectLog(neighbour?.filename ?? null)
      },
      onError: (error) => {
        toast.error(m.logs_delete_failed({ error: errorMessage(error) }))
      },
    })
  }
}

interface LogListProps {
  selectedLog: string | null
  onSelectLog: (filename: string | null) => void
}

export const LogList = ({ selectedLog, onSelectLog }: LogListProps) => {
  const [filterCommand, setFilterCommand] = useState<CommandFilter>('all')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const { currentJob } = useJob()
  const runningLog = currentJob?.logFile
  // Size and duration of the running log grow
  const {
    data: logs = [],
    isLoading,
    refetch,
  } = useLogs({ refetchInterval: runningLog ? 5000 : false })
  const handleDelete = useDeleteLogAction(selectedLog, onSelectLog)

  // A job that just started writes a new log
  useEffect(() => {
    if (runningLog) refetch()
  }, [runningLog, refetch])

  const commandCounts = useMemo(() => {
    const counts = new Map<SnapRaidCommand, number>()
    for (const log of logs) {
      counts.set(log.command, (counts.get(log.command) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [logs])

  const problemCount = logs.filter(isProblem).length
  const showConfig = new Set(logs.map((log) => log.configPath)).size > 1

  const query = searchTerm.trim().toLowerCase()
  const filteredLogs = logs.filter((log) => {
    if (filterCommand !== 'all' && log.command !== filterCommand) return false
    if (problemsOnly && !isProblem(log)) return false
    if (!query) return true
    return [
      log.filename,
      getCommandLabel(log.command),
      log.configPath ?? '',
      log.result ? getResultLabel(log.result) : '',
      new Date(log.timestamp).toLocaleString(),
    ].some((text) => text.toLowerCase().includes(query))
  })

  const groups: Array<{ key: string; heading: string; logs: LogFile[] }> = []
  for (const log of filteredLogs) {
    const key = dayKey(log.timestamp)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.logs.push(log)
    else {
      groups.push({
        key,
        heading: formatDayHeading(log.timestamp, getLocale()),
        logs: [log],
      })
    }
  }

  const isFiltered = filterCommand !== 'all' || problemsOnly || query !== ''
  const resetFilters = () => {
    setFilterCommand('all')
    setProblemsOnly(false)
    setSearchTerm('')
  }

  // Arrow keys step through the logs like a mail client
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    event.preventDefault()
    const index = filteredLogs.findIndex((log) => log.filename === selectedLog)
    const next =
      filteredLogs[
        event.key === 'ArrowDown'
          ? Math.min(index + 1, filteredLogs.length - 1)
          : Math.max(index - 1, 0)
      ]
    if (!next) return
    onSelectLog(next.filename)
    listRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-log="${CSS.escape(next.filename)}"]`,
      )
      ?.focus()
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
      <div className="border-b border-gray-200 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold text-gray-900">{m.log_list_title()}</h2>
          {!isLoading && (
            <span className="text-xs text-gray-500 tabular-nums">
              {isFiltered
                ? m.log_list_count_filtered({
                    shown: filteredLogs.length,
                    total: logs.length,
                  })
                : m.log_list_count({ count: logs.length })}
            </span>
          )}
        </div>
        <LogFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterCommand={filterCommand}
          onFilterChange={setFilterCommand}
          problemsOnly={problemsOnly}
          onProblemsOnlyChange={setProblemsOnly}
          commandCounts={commandCounts}
          totalCount={logs.length}
          problemCount={problemCount}
        />
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys bubble up from the focused log button */}
      <div
        ref={listRef}
        onKeyDown={handleKeyDown}
        className="max-h-[calc(100vh-280px)] min-h-48 overflow-auto"
      >
        {isLoading ? (
          <div className="divide-y divide-gray-100" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="ui-fade-in flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              {isFiltered ? <FilterX size={22} /> : <ScrollText size={22} />}
            </div>
            <p className="font-medium text-gray-900">
              {isFiltered ? m.log_list_no_matches() : m.log_list_no_logs()}
            </p>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              {isFiltered
                ? m.log_list_no_matches_hint()
                : m.log_list_no_logs_hint()}
            </p>
            {isFiltered && (
              <Button
                variant="secondary"
                size="sm"
                onClick={resetFilters}
                className="mt-4"
              >
                {m.log_filters_reset()}
              </Button>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <h3 className="sticky top-0 z-10 border-y border-gray-100 bg-gray-50/95 px-4 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase backdrop-blur first:border-t-0">
                {group.heading}
              </h3>
              <div className="divide-y divide-gray-100">
                {group.logs.map((log) => (
                  <LogListItem
                    key={log.filename}
                    log={log}
                    isSelected={selectedLog === log.filename}
                    isRunning={runningLog === log.filename}
                    configName={
                      showConfig ? configName(log.configPath) : undefined
                    }
                    onSelect={onSelectLog}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
