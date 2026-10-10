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
import { getCommandLabel } from '../lib/commands'
import {
  type LogMessage,
  type LogMessageLevel,
  type ParsedLog,
  parseLog,
} from '../lib/log-parse'
import { getResultLabel, RESULT_ICONS } from '../lib/run-result'
import {
  cn,
  formatBytes,
  formatDuration,
  formatRelativeTime,
} from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { useFeedback } from './Feedback'
import { useDeleteLogAction } from './LogList'
import { runDuration } from './LogListItem'
import { LogRawView } from './LogRawView'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Kbd } from './ui/kbd'
import { Skeleton } from './ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

// The running log grows, reload it while the job writes
const LIVE_REFRESH_MS = 3000

// How many files with block errors are listed before the rest is summed up
const ERROR_FILE_LIMIT = 8

type Tab = 'overview' | 'raw'

// Outcome of the run, with the running state the log itself cannot know
type ViewState = RunResult | 'running'

const STATE_ALERT: Record<
  ViewState,
  'info' | 'success' | 'warning' | 'destructive' | 'default'
> = {
  running: 'info',
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  aborted: 'default',
  incomplete: 'default',
}

const STATE_BADGE: Record<
  ViewState,
  'info' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  running: 'info',
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  aborted: 'secondary',
  incomplete: 'secondary',
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
    <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {title}
      {count !== undefined && (
        <Badge variant="secondary" className="px-1.5 tabular-nums">
          {count}
        </Badge>
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
  <div className="flex min-w-0 items-baseline gap-1.5">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="truncate font-medium" title={title}>
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
  <ul className="divide-y overflow-hidden rounded-lg border">
    {messages.map((message) => {
      const { icon: Icon, color } = MESSAGE_STYLES[message.level]
      return (
        <li key={message.line} className="flex items-start gap-3 px-3 py-2.5">
          <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
          <span className="min-w-0 flex-1 text-sm break-words">
            {message.text}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onJump(message.line)}
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                #{message.line}
              </button>
            </TooltipTrigger>
            <TooltipContent>{m.log_jump_to_line()}</TooltipContent>
          </Tooltip>
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
    <ul className="divide-y overflow-hidden rounded-lg border">
      {files.slice(0, ERROR_FILE_LIMIT).map((file) => (
        <li
          key={`${file.disk}:${file.file}`}
          className="flex items-start gap-3 px-3 py-2.5"
        >
          <FileText className="mt-0.5 size-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm">
              <span className="text-muted-foreground">{file.disk}/</span>
              {file.file}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {file.text}
            </p>
          </div>
          <Badge variant="destructive" className="tabular-nums">
            {file.count}×
          </Badge>
        </li>
      ))}
      {rest > 0 && (
        <li className="px-3 py-2 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-6">
      <Alert variant={STATE_ALERT[state]}>
        <StateIcon className={state === 'running' ? 'animate-spin' : ''} />
        <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
          {getStateTitle(state)}
          {parsed.exit && (
            <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs font-normal">
              exit: {parsed.exit}
            </code>
          )}
        </AlertTitle>
        <AlertDescription className="opacity-90">
          {getStateDescription(state)}
        </AlertDescription>
      </Alert>

      {stats.length > 0 && (
        <Section title={m.log_section_figures()}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2.5">
            {stats.map((stat) => {
              const isError = stat.key.startsWith('error_') && stat.value > 0
              return (
                <div
                  key={stat.key}
                  className={cn(
                    'rounded-lg border px-3 py-2.5',
                    isError && 'border-red-200 bg-red-50',
                  )}
                >
                  <p
                    className={cn(
                      'text-xs',
                      isError ? 'text-red-700' : 'text-muted-foreground',
                    )}
                  >
                    {stat.label}
                  </p>
                  <p
                    className={cn(
                      'font-mono text-xl font-medium tabular-nums',
                      isError
                        ? 'text-red-700'
                        : stat.value === 0 && 'text-muted-foreground',
                    )}
                  >
                    {stat.value.toLocaleString(getLocale())}
                  </p>
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
          <pre className="theme-fixed overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-5 text-gray-100">
            {parsed.report}
          </pre>
        </Section>
      )}

      {!hasProblems && !parsed.report && stats.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {m.log_nothing_reported()}
        </p>
      )}
    </div>
  )
}

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
    <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <ScrollText className="size-6" />
    </div>
    <p className="font-semibold">{m.log_viewer_select_log()}</p>
    <p className="mt-1 max-w-xs text-sm text-muted-foreground">
      {m.log_viewer_select_hint()}
    </p>
    <p className="mt-4 hidden items-center gap-1.5 text-xs text-muted-foreground @4xl:flex">
      <Kbd>↑</Kbd>
      <Kbd>↓</Kbd>
      {m.log_viewer_keys_hint()}
    </p>
  </div>
)

const IconAction = ({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
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
    <Card className="max-h-[calc(100vh-6rem)] flex-1 gap-0 overflow-hidden py-0">
      {children}
    </Card>
  )

  if (!selectedLog) return shell(<EmptyState />)

  const log: LogFile | undefined = logs.find(
    (entry) => entry.filename === selectedLog,
  )
  const command =
    log?.command ?? parsed?.args.at(-1) ?? selectedLog.split('-')[0]
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
  const problemCount = parsed
    ? parsed.messages.length + parsed.blockErrors.length
    : 0
  const ready = !isLoading && !isError && !!parsed && content !== undefined

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

  return shell(
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="min-h-0 flex-1 gap-0"
    >
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onSelectLog(null)}
            className="-ml-1.5 @4xl:hidden"
            aria-label={m.log_viewer_back()}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">
                {getCommandLabel(command)}
              </h2>
              {state === 'running' ? (
                <Badge variant="info">
                  <span className="ui-ping size-1.5 rounded-full bg-blue-600" />
                  {m.log_live()}
                </Badge>
              ) : (
                state && (
                  <Badge variant={STATE_BADGE[state]}>
                    {getResultLabel(state)}
                  </Badge>
                )
              )}
            </div>
            {startedAt && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {new Date(startedAt).toLocaleString(getLocale(), {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
                {' · '}
                {formatRelativeTime(startedAt, getLocale())}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <IconAction
              label={m.log_viewer_copy()}
              onClick={handleCopy}
              disabled={content === undefined}
            >
              {copied ? <Check className="text-green-600" /> : <Copy />}
            </IconAction>
            <IconAction
              label={m.log_viewer_download()}
              onClick={() =>
                content !== undefined && downloadText(selectedLog, content)
              }
              disabled={content === undefined}
            >
              <Download />
            </IconAction>
            <IconAction
              label={m.common_delete()}
              variant="ghostDestructive"
              onClick={() => handleDelete(selectedLog)}
              disabled={isRunning || !log}
            >
              <Trash2 />
            </IconAction>
          </div>
        </div>

        {parsed && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
              <span className="tabular-nums">
                {formatBytes(log?.size ?? content?.length ?? 0)}
              </span>
              <span className="font-normal text-muted-foreground">
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
            className="block truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs"
            title={commandLine(parsed.args)}
          >
            <span className="text-muted-foreground select-none">$ </span>
            {commandLine(parsed.args)}
          </code>
        )}

        <TabsList>
          <TabsTrigger value="overview">
            {m.log_tab_overview()}
            {problemCount > 0 && (
              <Badge variant="destructive" className="px-1.5 tabular-nums">
                {problemCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="raw">{m.log_tab_raw()}</TabsTrigger>
        </TabsList>
      </header>

      {!ready ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {isLoading ? (
            <div className="flex flex-col gap-3 p-5" aria-busy="true">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <FileSearch className="size-5" />
              </div>
              <p className="font-medium">{m.log_not_found()}</p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {selectedLog}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <TabsContent
            value="overview"
            className="min-h-0 overflow-auto p-4 sm:p-5"
          >
            {state && (
              <Overview parsed={parsed} state={state} onJump={jumpTo} />
            )}
          </TabsContent>
          <TabsContent value="raw" className="flex min-h-0 flex-col">
            <LogRawView key={selectedLog} content={content} jump={jump} />
          </TabsContent>
        </>
      )}
    </Tabs>,
  )
}
