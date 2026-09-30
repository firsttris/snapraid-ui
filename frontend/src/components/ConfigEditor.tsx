import { Info, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFileContent, useWriteFile } from '../hooks/queries'
import { useDialogKeys } from '../hooks/useDialogKeys'
import { validateConfig } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { ConfigEditorFooter } from './ConfigEditorFooter'
import { ConfigTextEditor } from './ConfigTextEditor'
import { DiskManager } from './DiskManager'
import { ErrorAlert } from './ErrorAlert'
import { useFeedback } from './Feedback'
import { ValidationResultAlert } from './ValidationResultAlert'
import { ViewModeToggle } from './ViewModeToggle'

interface ConfigEditorProps {
  configPath: string
  configName: string
  onClose: () => void
  onSaved?: () => void
}

export const ConfigEditor = ({
  configPath,
  configName,
  onClose,
  onSaved,
}: ConfigEditorProps) => {
  const { confirm } = useFeedback()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    output: string
  } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'text' | 'visual'>('visual')

  // TanStack Query hooks
  const {
    data: fileContent,
    isLoading: loading,
    refetch: refetchFile,
  } = useFileContent(configPath)
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

  // The visual editor writes the file itself, unsaved text would be overwritten on the next reload
  const changeViewMode = async (mode: 'text' | 'visual') => {
    if (mode === viewMode) return
    if (mode === 'visual' && hasChanges) {
      const confirmed = await confirm({
        message: m.config_editor_switch_discard_confirm(),
        confirmLabel: m.confirm_discard(),
        danger: true,
      })
      if (!confirmed) return
      setContent(originalContent)
    }
    setViewMode(mode)
  }

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
        },
      },
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

  // Ctrl+S / Cmd+S saves the text
  useEffect(() => {
    if (viewMode !== 'text') return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        if (hasChanges && !writeFileMutation.isPending) handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const handleClose = async () => {
    if (hasChanges) {
      const confirmed = await confirm({
        message: m.config_editor_unsaved_confirm(),
        confirmLabel: m.confirm_discard(),
        danger: true,
      })
      if (!confirmed) return
    }
    onClose()
  }

  useDialogKeys(dialogRef, handleClose)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut, Escape closes too
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-editor-title"
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[95vh] flex flex-col outline-none"
      >
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center gap-4">
          <div className="min-w-0">
            <h2
              id="config-editor-title"
              className="text-2xl font-semibold text-gray-900"
            >
              {configName}
            </h2>
            <p className="text-sm text-gray-600 mt-1 font-mono truncate">
              {configPath}
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <ViewModeToggle
              viewMode={viewMode}
              onViewModeChange={changeViewMode}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label={m.common_close()}
            >
              <X size={22} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 min-h-0">
          {error && <ErrorAlert error={error} />}

          {validationResult && (
            <ValidationResultAlert validationResult={validationResult} />
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : viewMode === 'visual' ? (
            <div className="flex-1 overflow-y-auto">
              <p className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                <Info size={16} className="shrink-0 text-blue-500" />
                {m.config_editor_visual_saves_immediately()}
              </p>
              <DiskManager
                configPath={configPath}
                onUpdate={handleDiskUpdate}
              />
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
