import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  type LucideIcon,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderConsoleOutput } from '../lib/progress'
import * as m from '../paraglide/messages'
import { useFeedback } from './Feedback'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

// Distance from the bottom within which the console keeps following new output
const FOLLOW_THRESHOLD_PX = 40

interface OutputConsoleProps {
  output: string
  command?: string
  isRunning: boolean
  // The last job failed, its output stays open to read what went wrong
  lastFailed: boolean
  onClear: () => void
}

const IconAction = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  expanded,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  expanded?: boolean
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-expanded={expanded}
      >
        <Icon />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

export const OutputConsole = ({
  output,
  command,
  isRunning,
  lastFailed,
  onClear,
}: OutputConsoleProps) => {
  const outputRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const [collapsed, setCollapsed] = useState(false)
  const { toast } = useFeedback()
  const text = useMemo(() => renderConsoleOutput(output), [output])

  // Open while a job runs, fold away once it succeeded so the dashboard stays compact
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to a job starting or ending
  useEffect(() => {
    setCollapsed(!isRunning && !lastFailed)
  }, [isRunning])

  // Follow new output only while the user hasn't scrolled up to read something
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger, not read inside
  useEffect(() => {
    const element = outputRef.current
    if (element && followRef.current) {
      element.scrollTop = element.scrollHeight
      lastScrollTopRef.current = element.scrollTop
    }
  }, [text, collapsed])

  // Scroll events of the programmatic scroll arrive after more output may have been added,
  // so only an upward move counts as the user leaving the bottom
  const handleScroll = () => {
    const element = outputRef.current
    if (!element) return
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      FOLLOW_THRESHOLD_PX
    if (atBottom) {
      followRef.current = true
    } else if (element.scrollTop < lastScrollTopRef.current) {
      followRef.current = false
    }
    lastScrollTopRef.current = element.scrollTop
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(m.output_console_copied())
    } catch {
      toast.error(m.output_console_copy_failed())
    }
  }

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `snapraid-${command || 'output'}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{m.output_console_title()}</h2>
        <div className="flex items-center gap-1">
          <IconAction
            icon={Copy}
            label={m.output_console_copy()}
            onClick={handleCopy}
            disabled={!output}
          />
          <IconAction
            icon={Download}
            label={m.output_console_download()}
            onClick={handleDownload}
            disabled={!output}
          />
          <IconAction
            icon={Trash2}
            label={m.output_console_clear()}
            onClick={onClear}
            disabled={!output}
          />
          <IconAction
            icon={collapsed ? ChevronDown : ChevronUp}
            label={
              collapsed
                ? m.output_console_expand()
                : m.output_console_collapse()
            }
            onClick={() => setCollapsed((prev) => !prev)}
            expanded={!collapsed}
          />
        </div>
      </div>
      {!collapsed && (
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className={`overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 font-mono text-sm text-green-400 ring-1 ring-black/5 dark:ring-white/10 ${
            output ? 'h-96' : 'h-24'
          }`}
        >
          {text || m.output_console_no_output()}
        </div>
      )}
    </Card>
  )
}
