import { useRef } from 'react'
import * as m from '../paraglide/messages'
import { Badge } from './ui/badge'

interface ConfigTextEditorProps {
  content: string
  hasChanges: boolean
  onContentChange: (content: string) => void
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const highlightSnapRaidConfig = (text: string): string => {
  // Keywords that should be highlighted
  const keywords = [
    'parity',
    '2-parity',
    '3-parity',
    '4-parity',
    '5-parity',
    '6-parity',
    'z-parity',
    'q-parity',
    'content',
    'data',
    'disk',
    'exclude',
    'include',
    'blocksize',
    'block_size',
    'hashsize',
    'autosave',
    'pool',
    'share',
    'smartctl',
    'nohidden',
    'verbose',
    'log',
  ]

  const lines = text.split('\n')

  return lines
    .map((line) => {
      // Skip empty lines and comments
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return `<span class="text-muted-foreground">${escapeHtml(line)}</span>`
      }

      // Check if line starts with a keyword
      const trimmedLine = line.trim()
      const keyword = keywords.find(
        (kw) => trimmedLine.startsWith(`${kw} `) || trimmedLine.startsWith(kw),
      )

      if (keyword) {
        const keywordIndex = line.indexOf(keyword)
        const before = line.substring(0, keywordIndex)
        const after = line.substring(keywordIndex + keyword.length)

        // Special handling for "data" keyword - extract disk name
        if (keyword === 'data') {
          const afterTrimmed = after.trim()
          const spaceIndex = afterTrimmed.indexOf(' ')
          if (spaceIndex > 0) {
            const diskName = afterTrimmed.substring(0, spaceIndex)
            const path = afterTrimmed.substring(spaceIndex)
            return `${escapeHtml(before)}<span class="text-blue-700 font-semibold">${keyword}</span> <span class="text-purple-700 font-medium">${escapeHtml(diskName)}</span><span class="text-green-700">${escapeHtml(path)}</span>`
          }
        }

        // Highlight the keyword in blue and the path/value in green
        return `${escapeHtml(before)}<span class="text-blue-700 font-semibold">${keyword}</span><span class="text-green-700">${escapeHtml(after)}</span>`
      }

      return escapeHtml(line)
    })
    .join('\n')
}

export const ConfigTextEditor = ({
  content,
  hasChanges,
  onContentChange,
}: ConfigTextEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Sync scroll between textarea and highlight
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  return (
    <div className="flex min-h-[320px] flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div>
          {hasChanges && (
            <Badge variant="warning">{m.config_editor_unsaved_changes()}</Badge>
          )}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {m.config_editor_lines()}: {content.split('\n').length}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Syntax highlighted background */}
        <div
          ref={highlightRef}
          className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap rounded-lg border border-input bg-background px-4 py-3 font-mono text-sm text-foreground dark:bg-input/30"
          style={{ wordWrap: 'break-word' }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: all user content is passed through escapeHtml
          dangerouslySetInnerHTML={{ __html: highlightSnapRaidConfig(content) }}
        />
        {/* Transparent textarea overlay */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          onScroll={handleScroll}
          aria-label={m.config_editor_text_mode()}
          className="absolute inset-0 h-full w-full resize-none rounded-lg border border-transparent bg-transparent px-4 py-3 font-mono text-sm text-transparent caret-foreground outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
