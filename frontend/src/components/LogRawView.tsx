import { EyeOff, Search, WrapText, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { classifyLogLine, type LogLineKind } from '../lib/log-parse'
import * as m from '../paraglide/messages'
import { Input } from './ui/input'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

// Rendering tens of thousands of lines at once stalls the page
const LINE_LIMIT = 2000

const LINE_STYLES: Record<LogLineKind, string> = {
  fatal: 'text-red-300 bg-red-500/15',
  error: 'text-red-300',
  warning: 'text-yellow-300 bg-yellow-500/10',
  status: 'text-gray-100',
  summary: 'text-cyan-300',
  noise: 'text-gray-500',
  default: 'text-gray-300',
}

// Tag name dimmed, so the values are what the eye lands on
const TagLine = ({ text, query }: { text: string; query: string }) => {
  const colon = text.indexOf(':')
  const tag = colon > 0 && colon < 24 ? text.slice(0, colon + 1) : ''
  return (
    <>
      {tag && <span className="text-gray-500">{tag}</span>}
      <Highlight text={text.slice(tag.length)} query={query} />
    </>
  )
}

const Highlight = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <>{text}</>
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  let from = 0
  let index = lower.indexOf(query, from)
  while (index >= 0) {
    parts.push(text.slice(from, index))
    parts.push(
      <mark key={index} className="rounded-sm bg-yellow-300 text-gray-900">
        {text.slice(index, index + query.length)}
      </mark>,
    )
    from = index + query.length
    index = lower.indexOf(query, from)
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

interface LogRawViewProps {
  content: string
  // Line to scroll to, e.g. a message picked in the overview; a new object jumps again
  jump: { line: number } | null
}

export const LogRawView = ({ content, jump }: LogRawViewProps) => {
  const targetLine = jump?.line ?? null
  const [searchTerm, setSearchTerm] = useState('')
  const [hideNoise, setHideNoise] = useState(false)
  const [wrap, setWrap] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const lines = useMemo(
    () =>
      content
        .replace(/\n$/, '')
        .split('\n')
        .map((text, index) => ({
          number: index + 1,
          text: text.replace(/\r$/, ''),
          kind: classifyLogLine(text),
        })),
    [content],
  )

  const query = searchTerm.trim().toLowerCase()
  const visible = lines.filter(
    (line) =>
      (!hideNoise || line.kind !== 'noise' || line.number === targetLine) &&
      (!query || line.text.toLowerCase().includes(query)),
  )
  const shown = showAll ? visible : visible.slice(0, LINE_LIMIT)
  const targetHidden =
    targetLine !== null &&
    !shown.some((line) => line.number === targetLine) &&
    targetLine <= lines.length

  // A jump from the overview must reach its line even past the limit
  useEffect(() => {
    if (targetHidden) setShowAll(true)
  }, [targetHidden])

  // biome-ignore lint/correctness/useExhaustiveDependencies: showAll renders the line first when it was past the limit
  useEffect(() => {
    if (!jump) return
    containerRef.current
      ?.querySelector(`[data-line="${jump.line}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [jump, showAll])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 sm:px-5">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={m.log_raw_search()}
            aria-label={m.log_raw_search()}
            className="h-8 px-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label={m.log_filters_clear_search()}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {query && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m.log_raw_matches({ count: visible.length })}
          </span>
        )}
        <ToggleGroup
          type="multiple"
          value={[...(hideNoise ? ['noise'] : []), ...(wrap ? ['wrap'] : [])]}
          onValueChange={(next) => {
            setHideNoise(next.includes('noise'))
            setWrap(next.includes('wrap'))
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="noise" className="px-2.5 text-xs">
                <EyeOff className="size-3.5" />
                {m.log_raw_hide_noise()}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{m.log_raw_hide_noise_hint()}</TooltipContent>
          </Tooltip>
          <ToggleGroupItem value="wrap" className="px-2.5 text-xs">
            <WrapText className="size-3.5" />
            {m.log_raw_wrap()}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        ref={containerRef}
        className="theme-fixed min-h-64 flex-1 overflow-auto bg-gray-950 py-2 font-mono text-xs leading-5"
      >
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center font-sans text-sm text-gray-500">
            {m.log_raw_no_matches()}
          </p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {shown.map((line) => (
                <tr
                  key={line.number}
                  data-line={line.number}
                  className={`${LINE_STYLES[line.kind]} ${
                    line.number === targetLine
                      ? 'bg-blue-500/25 outline outline-1 outline-blue-400/60'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <td className="w-px pr-3 pl-4 text-right align-top text-gray-600 tabular-nums select-none">
                    {line.number}
                  </td>
                  <td
                    className={`pr-4 ${wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'}`}
                  >
                    <TagLine text={line.text} query={query} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown.length < visible.length && (
          <div className="px-4 py-3 font-sans">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
            >
              {m.log_raw_show_all({ count: visible.length })}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
