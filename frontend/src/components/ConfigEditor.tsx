import { Info, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFileContent, useWriteFile } from '../hooks/queries'
import { validateConfig } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'
import { ConfigEditorFooter } from './ConfigEditorFooter'
import { ConfigTextEditor } from './ConfigTextEditor'
import { DiskManager } from './DiskManager'
import { ErrorAlert } from './ErrorAlert'
import { useFeedback } from './Feedback'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
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

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent className="flex h-[90dvh] max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="gap-3 border-b px-4 py-4 pr-12 text-left sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{configName}</DialogTitle>
            <DialogDescription className="mt-1.5 truncate font-mono text-xs">
              {configPath}
            </DialogDescription>
          </div>
          <ViewModeToggle
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
          />
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
          {error && <ErrorAlert error={error} />}

          {validationResult && (
            <ValidationResultAlert validationResult={validationResult} />
          )}

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : viewMode === 'visual' ? (
            <>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4 shrink-0" />
                {m.config_editor_visual_saves_immediately()}
              </p>
              <DiskManager
                configPath={configPath}
                onUpdate={handleDiskUpdate}
              />
            </>
          ) : (
            <ConfigTextEditor
              content={content}
              hasChanges={hasChanges}
              onContentChange={setContent}
            />
          )}
        </div>

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
      </DialogContent>
    </Dialog>
  )
}
