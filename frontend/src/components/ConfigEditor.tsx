import { useState, useEffect } from 'react'
import { validateConfig } from '../lib/api/snapraid'
import { useFileContent, useWriteFile } from '../hooks/queries'
import { DiskManager } from './DiskManager'
import { ViewModeToggle } from './ViewModeToggle'
import { ErrorAlert } from './ErrorAlert'
import { ValidationResultAlert } from './ValidationResultAlert'
import { ConfigTextEditor } from './ConfigTextEditor'
import { ConfigEditorFooter } from './ConfigEditorFooter'
import * as m from '../paraglide/messages'

interface ConfigEditorProps {
  configPath: string
  configName: string
  onClose: () => void
  onSaved?: () => void
}

export const ConfigEditor = ({ configPath, configName, onClose, onSaved }: ConfigEditorProps) => {
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationResult, setValidationResult] = useState<{ valid: boolean; output: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'text' | 'visual'>('visual')

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

  const handleDiskUpdate = () => {
    // Reload the file content when disks are updated
    refetchFile()
  }

  const handleSave = async () => {
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

  const handleValidate = async () => {
    setValidating(true)
    setError('')
    setValidationResult(null)
    try {
      const result = await validateConfig(configPath)
      setValidationResult(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setValidating(false)
    }
  }

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm(m.config_editor_unsaved_confirm())) {
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
            <h2 className="text-2xl font-semibold text-gray-900">{m.config_editor_title()}</h2>
            <p className="text-sm text-gray-600 mt-1 font-mono">{configName} — {configPath}</p>
          </div>
          <div className="flex items-center gap-4">
            <ViewModeToggle 
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
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
          {error && <ErrorAlert error={error} />}

          {validationResult && <ValidationResultAlert validationResult={validationResult} />}

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : viewMode === 'visual' ? (
            <div className="flex-1 overflow-y-auto">
              <DiskManager configPath={configPath} onUpdate={handleDiskUpdate} />
            </div>
          ) : (
            <ConfigTextEditor 
              content={content}
              hasChanges={hasChanges}
              onContentChange={setContent}
            />
          )}
        </div>

        {/* Footer */}
        <ConfigEditorFooter 
          viewMode={viewMode}
          hasChanges={hasChanges}
          validating={validating}
          saving={writeFileMutation.isPending}
          loading={loading}
          onValidate={handleValidate}
          onSave={handleSave}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
