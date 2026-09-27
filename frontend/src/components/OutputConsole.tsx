import { ChevronDown, ChevronUp, Copy, Download, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderConsoleOutput } from '../lib/progress'
import * as m from '../paraglide/messages'
import { useFeedback } from './Feedback'

// Distance from the bottom within which the console keeps following new output
const FOLLOW_THRESHOLD_PX = 40

interface OutputConsoleProps {
  output: string
  command?: string
  onClear: () => void
}

export const OutputConsole = ({
  output,
  command,
  onClear,
}: OutputConsoleProps) => {
  const outputRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const [collapsed, setCollapsed] = useState(false)
  const { toast } = useFeedback()
  const text = useMemo(() => renderConsoleOutput(output), [output])

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

  const iconButton =
    'p-1.5 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{m.output_console_title()}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!output}
            className={iconButton}
            title={m.output_console_copy()}
            aria-label={m.output_console_copy()}
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!output}
            className={iconButton}
            title={m.output_console_download()}
            aria-label={m.output_console_download()}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!output}
            className={iconButton}
            title={m.output_console_clear()}
            aria-label={m.output_console_clear()}
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className={iconButton}
            title={
              collapsed
                ? m.output_console_expand()
                : m.output_console_collapse()
            }
            aria-label={
              collapsed
                ? m.output_console_expand()
                : m.output_console_collapse()
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className={`mt-4 bg-black text-green-400 p-4 rounded font-mono text-sm overflow-y-auto whitespace-pre-wrap ${
            output ? 'h-96' : 'h-24'
          }`}
        >
          {text || m.output_console_no_output()}
        </div>
      )}
    </div>
  )
}
