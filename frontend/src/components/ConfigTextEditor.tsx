import { useRef, useEffect } from 'react'
import * as m from '../paraglide/messages'

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
    'parity', 'q-parity', 'content', 'data', 'disk', 'exclude', 
    'include', 'block_size', 'hashsize', 'autosave', 'pool',
    'share', 'smartctl', 'nohidden', 'verbose', 'log'
  ]
  
  const lines = text.split('\n')
  
  return lines.map(line => {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      return `<span class="text-gray-400">${escapeHtml(line)}</span>`
    }
    
    // Check if line starts with a keyword
    const trimmedLine = line.trim()
    const keyword = keywords.find(kw => trimmedLine.startsWith(kw + ' ') || trimmedLine.startsWith(kw))
    
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
          return `${escapeHtml(before)}<span class="text-blue-600 font-semibold">${keyword}</span> <span class="text-purple-600 font-medium">${escapeHtml(diskName)}</span><span class="text-green-600">${escapeHtml(path)}</span>`
        }
      }
      
      // Highlight the keyword in blue and the path/value in green
      return `${escapeHtml(before)}<span class="text-blue-600 font-semibold">${keyword}</span><span class="text-green-600">${escapeHtml(after)}</span>`
    }
    
    return escapeHtml(line)
  }).join('\n')
}

export const ConfigTextEditor = ({ content, hasChanges, onContentChange }: ConfigTextEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Sync scroll between textarea and highlight
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  // Add scroll event listener with cleanup
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.addEventListener('scroll', handleScroll)
      return () => {
        textarea.removeEventListener('scroll', handleScroll)
      }
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="text-sm text-gray-600">
          {hasChanges && (
            <span className="text-orange-600 font-medium">{m.config_editor_unsaved_changes()}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {m.config_editor_lines()}: {content.split('\n').length}
        </div>
      </div>
      <div className="flex-1 relative min-h-0">
        {/* Syntax highlighted background */}
        <div
          ref={highlightRef}
          className="absolute inset-0 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm overflow-auto whitespace-pre-wrap pointer-events-none bg-white"
          style={{ wordWrap: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: highlightSnapRaidConfig(content) }}
        />
        {/* Transparent textarea overlay */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          onScroll={handleScroll}
          className="absolute inset-0 w-full h-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-transparent caret-gray-900"
          style={{ color: 'transparent', caretColor: '#111827' }}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
