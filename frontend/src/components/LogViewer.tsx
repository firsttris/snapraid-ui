import type { LogFile, RunResult } from '@shared/types'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  Download,
  FileSearch,
  FileText,
  Loader2,
  OctagonX,
  ScrollText,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLogContent, useLogs } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import {
  getCommandIcon,
  getCommandLabel,
  getCommandTone,
} from '../lib/commands'
import {
  type LogMessage,
  type LogMessageLevel,
  type ParsedLog,
  parseLog,
} from '../lib/log-parse'
import { getResultLabel, RESULT_ICONS, RESULT_STYLES } from '../lib/run-result'
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
} from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'
import { useFeedback } from './Feedback'
import { useDeleteLogAction } from './LogList'
import { runDuration } from './LogListItem'
import { LogRawView } from './LogRawView'
import { Skeleton } from './Skeleton'

// The running log grows, reload it while the job writes
const LIVE_REFRESH_MS = 3000

// How many files with block errors are listed before the rest is summed up
const ERROR_FILE_LIMIT = 8

type Tab = 'overview' | 'raw'

// Outcome of the run, with the running state the log itself cannot know
type ViewState = RunResult | 'running'

const STATE_BOX: Record<ViewState, string> = {
  running: 'border-blue-200 bg-blue-50 text-blue-900',
  ok: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  aborted: 'border-gray-200 bg-gray-50 text-gray-900',
  incomplete: 'border-gray-200 bg-gray-50 text-gray-900',
}

const STATE_ICON_COLOR: Record<ViewState, string> = {
  running: 'text-blue-600',
  ok: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
  aborted: 'text-gray-500',
  incomplete: 'text-gray-500',
}

const getStateTitle = (state: ViewState) =>
  state === 'running' ? m.log_running() : getResultLabel(state)

const getStateDescription = (state: ViewState): string => {
  switch (state) {
    case 'running':
      return m.log_state_running()
    case 'ok':
      return m.log_state_ok()
    case 'warning':
      return m.log_state_warning()
    case 'error':
      return m.log_state_error()
    case 'aborted':
      return m.log_state_aborted()
    case 'incomplete':
      return m.log_state_incomplete()
  }
}

// Same rules as the backend's parseRunResult, for a log that is not in the list (yet)
const resultFromLog = (log: ParsedLog, hasFatal: boolean): RunResult => {
  if (log.aborted) return 'aborted'
  if (!log.exit) return hasFatal ? 'error' : 'incomplete'
  if (['ok', 'recovered', 'equal', 'diff', 'nodup', 'dup'].includes(log.exit))
    return 'ok'
  if (log.exit === 'warning' || log.exit === 'recoverable') return 'warning'
  return 'error'
}

const STAT_LABELS: Array<[string, () => string]> = [
  ['added', m.log_stat_added],
  ['removed', m.log_stat_removed],
  ['updated', m.log_stat_updated],
  ['moved', m.log_stat_moved],
  ['copied', m.log_stat_copied],
  ['restored', m.log_stat_restored],
  ['file_count', m.log_stat_files],
  ['dup_count', m.log_stat_duplicates],
  ['error_soft', m.log_stat_error_soft],
  ['error_io', m.log_stat_error_io],
  ['error_data', m.log_stat_error_data],
  ['error_unrecoverable', m.log_stat_error_unrecoverable],
]

const MESSAGE_STYLES: Record<
  LogMessageLevel,
  { icon: typeof CircleAlert; color: string }
> = {
  fatal: { icon: OctagonX, color: 'text-red-600' },
  error: { icon: CircleAlert, color: 'text-red-600' },
  warning: { icon: TriangleAlert, color: 'text-yellow-600' },
}

// What SnapRAID was started with, without the options the UI always adds
const commandLine = (args: string[]) => {
  const shown: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (['-l', '--log', '-c', '--conf'].includes(args[i])) {
      i++
      continue
    }
    shown.push(args[i])
  }
  return ['snapraid', ...shown].join(' ')
}

const downloadText = (filename: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const Section = ({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) => (
  <section>
    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
      {title}
      {count !== undefined && (
        <span className="rounded-full bg-gray-100 px-1.5 font-medium text-gray-600 tabular-nums">
          {count}
        </span>
      )}
    </h3>
    {children}
  </section>
)

const MetaItem = ({
  label,
  children,
  title,
}: {
  label: string
  children: React.ReactNode
  title?: string
}) => (
  <div className="min-w-0">
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="truncate text-sm font-medium text-gray-900" title={title}>
      {children}
    </dd>
  </div>
)

const MessageList = ({
  messages,
  onJump,
}: {
  messages: LogMessage[]
  onJump: (line: number) => void
}) => (
  <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
    {messages.map((message) => {
      const { icon: Icon, color } = MESSAGE_STYLES[message.level]
      return (
        <li key={message.line} className="flex items-start gap-3 px-3 py-2.5">
          <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
          <span className="min-w-0 flex-1 text-sm break-words text-gray-800">
            {message.text}
          </span>
          <button
            type="button"
            onClick={() => onJump(message.line)}
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs text-gray-500 hover:bg-gray-100 hover:text-blue-600"
            title={m.log_jump_to_line()}
          >
            #{message.line}
          </button>
        </li>
      )
    })}
  </ul>
)

const BlockErrors = ({ errors }: { errors: ParsedLog['blockErrors'] }) => {
  const byFile = new Map<
    string,
    { disk: string; file: string; count: number; text: string }
  >()
  for (const error of errors) {
    const key = `${error.disk}:${error.file}`
    const entry = byFile.get(key)
    if (entry) entry.count++
    else byFile.set(key, { ...error, count: 1 })
  }
  const files = [...byFile.values()].sort((a, b) => b.count - a.count)
  const rest = files.length - ERROR_FILE_LIMIT

  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-red-200">
      {files.slice(0, ERROR_FILE_LIMIT).map((file) => (
        <li
          key={`${file.disk}:${file.file}`}
          className="flex items-start gap-3 px-3 py-2.5"
        >
          <FileText size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm text-gray-900">
              <span className="text-gray-500">{file.disk}/</span>
              {file.file}
            </p>
            <p className="truncate text-xs text-gray-500">{file.text}</p>
          </div>
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 tabular-nums">
            {file.count}×
          </span>
        </li>
      ))}
      {rest > 0 && (
        <li className="px-3 py-2 text-xs text-gray-500">
          {m.log_more_files({ count: rest })}
        </li>
      )}
    </ul>
  )
}

const Overview = ({
  parsed,
  state,
  onJump,
}: {
  parsed: ParsedLog
  state: ViewState
  onJump: (line: number) => void
}) => {
  const StateIcon = state === 'running' ? Loader2 : RESULT_ICONS[state]
  const stats = STAT_LABELS.filter(([key]) => parsed.summary.has(key)).map(
    ([key, label]) => ({
      key,
      label: label(),
      value: Number(parsed.summary.get(key)),
    }),
  )
  const hasProblems =
    parsed.messages.length > 0 || parsed.blockErrors.length > 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${STATE_BOX[state]}`}
      >
        <StateIcon
          size={20}
          className={`mt-0.5 shrink-0 ${STATE_ICON_COLOR[state]} ${state === 'running' ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{getStateTitle(state)}</p>
          <p className="mt-0.5 text-sm opacity-80">
            {getStateDescription(state)}
          </p>
        </div>
        {parsed.exit && (
          <code className="shrink-0 rounded bg-white/60 px-1.5 py-0.5 text-xs">
            exit: {parsed.exit}
          </code>
        )}
      </div>

      {stats.length > 0 && (
        <Section title={m.log_section_figures()}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {stats.map((stat) => {
              const isError = stat.key.startsWith('error_') && stat.value > 0
              return (
                <div
                  key={stat.key}
                  className={`rounded-lg border px-3 py-2 ${isError ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
                >
                  <p
                    className={`text-lg font-semibold tabular-nums ${isError ? 'text-red-700' : stat.value === 0 ? 'text-gray-400' : 'text-gray-900'}`}
                  >
                    {stat.value.toLocaleString(getLocale())}
                  </p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {parsed.messages.length > 0 && (
        <Section
          title={m.log_section_messages()}
          count={parsed.messages.length}
        >
          <MessageList messages={parsed.messages} onJump={onJump} />
        </Section>
      )}

      {parsed.blockErrors.length > 0 && (
        <Section
          title={m.log_section_block_errors()}
          count={parsed.blockErrors.length}
        >
          <BlockErrors errors={parsed.blockErrors} />
        </Section>
      )}

      {parsed.report && (
        <Section title={m.log_section_report()}>
          <pre className="theme-fixed overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs leading-5 text-gray-100">
            {parsed.report}
          </pre>
        </Section>
      )}

      {!hasProblems && !parsed.report && stats.length === 0 && (
        <p className="text-sm text-gray-500">{m.log_nothing_reported()}</p>
      )}
    </div>
  )
}

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-indigo-100 text-indigo-600">
      <ScrollText size={26} />
    </div>
    <p className="font-semibold text-gray-900">{m.log_viewer_select_log()}</p>
    <p className="mt-1 max-w-xs text-sm text-gray-500">
      {m.log_viewer_select_hint()}
    </p>
    <p className="mt-4 hidden items-center gap-1.5 text-xs text-gray-400 lg:flex">
      <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 font-sans">
        ↑
      </kbd>
      <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 font-sans">
        ↓
      </kbd>
      {m.log_viewer_keys_hint()}
    </p>
  </div>
)

interface LogViewerProps {
  selectedLog: string | null
  onSelectLog: (filename: string | null) => void
}

export const LogViewer = ({ selectedLog, onSelectLog }: LogViewerProps) => {
  const { toast } = useFeedback()
  const { currentJob } = useJob()
  const isRunning = !!selectedLog && currentJob?.logFile === selectedLog
  const { data: logs = [] } = useLogs()
  const {
    data: content,
    isLoading,
    isError,
  } = useLogContent(selectedLog ?? undefined, {
    refetchInterval: isRunning ? LIVE_REFRESH_MS : false,
  })
  const handleDelete = useDeleteLogAction(selectedLog, onSelectLog)
  const [tab, setTab] = useState<Tab>('overview')
  const [jump, setJump] = useState<{ line: number } | null>(null)
  const [copied, setCopied] = useState(false)

  // A jump belongs to the log it was made in
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on a new selection only
  useEffect(() => setJump(null), [selectedLog])

  const parsed = useMemo(
    () => (content !== undefined ? parseLog(content) : undefined),
    [content],
  )

  const shell = (children: React.ReactNode) => (
    <section className="flex max-h-[calc(100vh-3rem)] flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
      {children}
    </section>
  )

  if (!selectedLog) return shell(<EmptyState />)

  const log: LogFile | undefined = logs.find(
    (entry) => entry.filename === selectedLog,
  )
  const command =
    log?.command ?? parsed?.args.at(-1) ?? selectedLog.split('-')[0]
  const Icon = getCommandIcon(command)
  const startedAt = parsed?.startedAt ?? log?.timestamp
  const duration = log && !isRunning ? runDuration(log) : undefined
  const state: ViewState | undefined = isRunning
    ? 'running'
    : (log?.result ??
      (parsed &&
        resultFromLog(
          parsed,
          parsed.messages.some((msg) => msg.level === 'fatal'),
        )))

  const jumpTo = (line: number) => {
    setTab('raw')
    setJump({ line })
  }

  const handleCopy = async () => {
    if (content === undefined) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // The clipboard API needs a secure context, plain http has none
      toast.error(m.log_copy_failed())
    }
  }

  const tabClass = (active: boolean) =>
    `relative px-1 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'text-gray-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-blue-600'
        : 'text-gray-500 hover:text-gray-900'
    }`

  return shell(
    <>
      <header className="border-b border-gray-200 px-4 pt-4 sm:px-6">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => onSelectLog(null)}
            className="-ml-1.5 lg:hidden"
            aria-label={m.log_viewer_back()}
          >
            <ArrowLeft size={18} />
          </Button>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getCommandTone(command)}`}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {getCommandLabel(command)}
              </h2>
              {state === 'running' ? (
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
                  {m.log_live()}
                </span>
              ) : (
                state && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${RESULT_STYLES[state]}`}
                  >
                    {getResultLabel(state)}
                  </span>
                )
              )}
            </div>
            {startedAt && (
              <p className="text-sm text-gray-500">
                {new Date(startedAt).toLocaleString(getLocale(), {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
                <span className="text-gray-400">
                  {' · '}
                  {formatRelativeTime(startedAt, getLocale())}
                </span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleCopy}
              disabled={content === undefined}
              aria-label={m.log_viewer_copy()}
              title={m.log_viewer_copy()}
            >
              {copied ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <Copy size={16} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() =>
                content !== undefined && downloadText(selectedLog, content)
              }
              disabled={content === undefined}
              aria-label={m.log_viewer_download()}
              title={m.log_viewer_download()}
            >
              <Download size={16} />
            </Button>
            <Button
              variant="ghostDanger"
              size="iconSm"
              onClick={() => handleDelete(selectedLog)}
              disabled={isRunning || !log}
              aria-label={m.common_delete()}
              title={m.common_delete()}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        {parsed && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <MetaItem
              label={m.log_meta_config()}
              title={parsed.configPath ?? log?.configPath}
            >
              {(parsed.configPath ?? log?.configPath)?.split('/').pop() ?? '–'}
            </MetaItem>
            <MetaItem label={m.log_meta_duration()}>
              {isRunning
                ? m.log_running()
                : duration !== undefined
                  ? formatDuration(duration)
                  : '–'}
            </MetaItem>
            <MetaItem label={m.log_meta_size()}>
              {formatFileSize(log?.size ?? content?.length ?? 0)}
              <span className="font-normal text-gray-500">
                {' · '}
                {m.log_meta_lines({ count: parsed.lineCount })}
              </span>
            </MetaItem>
            <MetaItem label={m.log_meta_version()}>
              {parsed.version ? `SnapRAID ${parsed.version}` : '–'}
            </MetaItem>
          </dl>
        )}
        {parsed && parsed.args.length > 0 && (
          <code
            className="mt-3 block truncate rounded-md bg-gray-100 px-2.5 py-1.5 font-mono text-xs text-gray-700"
            title={commandLine(parsed.args)}
          >
            <span className="text-gray-400 select-none">$ </span>
            {commandLine(parsed.args)}
          </code>
        )}

        <div role="tablist" className="mt-3 flex gap-5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overview'}
            onClick={() => setTab('overview')}
            className={tabClass(tab === 'overview')}
          >
            {m.log_tab_overview()}
            {parsed &&
              parsed.messages.length + parsed.blockErrors.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-xs text-red-700 tabular-nums">
                  {parsed.messages.length + parsed.blockErrors.length}
                </span>
              )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'raw'}
            onClick={() => setTab('raw')}
            className={tabClass(tab === 'raw')}
          >
            {m.log_tab_raw()}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {isLoading ? (
          <div className="space-y-3 p-6" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : isError || !parsed || content === undefined ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <FileSearch size={22} />
            </div>
            <p className="font-medium text-gray-900">{m.log_not_found()}</p>
            <p className="mt-1 text-sm text-gray-500">{selectedLog}</p>
          </div>
        ) : tab === 'overview' ? (
          state && <Overview parsed={parsed} state={state} onJump={jumpTo} />
        ) : (
          <LogRawView key={selectedLog} content={content} jump={jump} />
        )}
      </div>
    </>,
  )
}
