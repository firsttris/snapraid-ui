import { useState, useEffect, useRef } from 'react'
import { apiClient, useFileContent, useWriteFile } from '../lib/api-client'
import { DiskManager } from './DiskManager'

interface ConfigEditorProps {
  configPath: string
  configName: string
  onClose: () => void
  onSaved?: () => void
}

function highlightSnapRaidConfig(text: string): string {
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function ConfigEditor({ configPath, configName, onClose, onSaved }: ConfigEditorProps) {
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationResult, setValidationResult] = useState<{ valid: boolean; output: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'text' | 'visual'>('visual')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // TanStack Query hooks
  const { data: fileContent, isLoading: loading, refetch: refetchFile } = useFileContent(configPath)
  const writeFileMutation = useWriteFile()

  // Initialize content when file is loaded
  useEffect(() => {
    if (fileContent !== undefined) {
      setContent(fileContent)
      setOriginalContent(fileContent)
    }
  }, [fileContent])

  useEffect(() => {
    setHasChanges(content !== originalContent)
  }, [content, originalContent])

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
  }, [viewMode])

  function handleDiskUpdate() {
    // Reload the file content when disks are updated
    refetchFile()
  }

  async function handleSave() {
    setError('')
    writeFileMutation.mutate(
      { path: configPath, content },
      {
        onSuccess: () => {
          setOriginalContent(content)
          onSaved?.()
          // Auto-validate after save
          handleValidate()
        },
        onError: (err) => {
          setError(String(err))
        }
      }
    )
  }

  async function handleValidate() {
    setValidating(true)
    setError('')
    setValidationResult(null)
    try {
      const result = await apiClient.validateConfig(configPath)
      setValidationResult(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setValidating(false)
    }
  }

  function handleClose() {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Edit Configuration</h2>
            <p className="text-sm text-gray-600 mt-1 font-mono">{configName} — {configPath}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('visual')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'visual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Visual Editor
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'text'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Text Editor
              </button>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 min-h-0">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {validationResult && (
            <div className={`mb-4 p-4 rounded-lg border ${validationResult.valid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <div className="flex items-start gap-3">
                {validationResult.valid ? (
                  <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="flex-1">
                  <div className={`font-semibold ${validationResult.valid ? 'text-green-800' : 'text-yellow-800'}`}>
                    {validationResult.valid ? 'Configuration is Valid' : 'Validation Issues Found'}
                  </div>
                  {!validationResult.valid && validationResult.output && (
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white/50 p-2 rounded mt-2">
                      {validationResult.output}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : viewMode === 'visual' ? (
            <div className="flex-1 overflow-y-auto">
              <DiskManager configPath={configPath} onUpdate={handleDiskUpdate} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-sm text-gray-600">
                  {hasChanges && (
                    <span className="text-orange-600 font-medium">● Unsaved changes</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Lines: {content.split('\n').length}
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
                  onChange={(e) => setContent(e.target.value)}
                  onScroll={handleScroll}
                  className="absolute inset-0 w-full h-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-transparent caret-gray-900"
                  style={{ color: 'transparent', caretColor: '#111827' }}
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleValidate}
            disabled={validating || loading}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {validating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Validating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Validate Config
              </>
            )}
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            {viewMode === 'text' && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || writeFileMutation.isPending || loading}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {writeFileMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
