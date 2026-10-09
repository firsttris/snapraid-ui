import { useBlocker } from '@tanstack/react-router'
import { CircleCheck, Info, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFileContent, useWriteFile } from '../hooks/queries'
import { validateConfig } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'
import { ConfigTextEditor } from './ConfigTextEditor'
import { DiskManager } from './DiskManager'
import { ErrorAlert } from './ErrorAlert'
import { useFeedback } from './Feedback'
import { SaveBar } from './SaveBar'
import { Button } from './ui/button'
import { ValidationResultAlert } from './ValidationResultAlert'
import { ViewModeToggle } from './ViewModeToggle'

interface ConfigEditorProps {
  configPath: string
}

/**
 * The array's snapraid.conf: disks and settings in the visual editor, or the file as text
 */
export const ConfigEditor = ({ configPath }: ConfigEditorProps) => {
  const { confirm } = useFeedback()
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    output: string
  } | null>(null)
  const [viewMode, setViewMode] = useState<'text' | 'visual'>('visual')

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

  const hasChanges = content !== originalContent

  // Unsaved text is not lost by leaving the page
  useBlocker({
    shouldBlockFn: async () => {
      if (!hasChanges) return false
      const leave = await confirm({
        message: m.config_editor_unsaved_confirm(),
        confirmLabel: m.confirm_discard(),
        danger: true,
      })
      return !leave
    },
    enableBeforeUnload: () => hasChanges,
  })

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

  const handleSave = () => {
    setError('')
    writeFileMutation.mutate(
      { path: configPath, content },
      {
        onSuccess: () => {
          setOriginalContent(content)
          // Auto-validate after save
          handleValidate()
        },
        onError: (err) => {
          setError(String(err))
        },
      },
    )
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle viewMode={viewMode} onViewModeChange={changeViewMode} />
        <Button
          variant="outline"
          onClick={handleValidate}
          disabled={validating || loading}
        >
          {validating ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          {validating
            ? m.config_editor_validating()
            : m.config_editor_validate()}
        </Button>
      </div>

      {error && <ErrorAlert error={error} />}

      {validationResult && (
        <ValidationResultAlert validationResult={validationResult} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : viewMode === 'visual' ? (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" />
            {m.config_editor_visual_saves_immediately()}
          </p>
          <DiskManager configPath={configPath} onUpdate={() => refetchFile()} />
        </>
      ) : (
        <>
          <div className="flex h-[65vh] flex-col">
            <ConfigTextEditor
              content={content}
              hasChanges={hasChanges}
              onContentChange={setContent}
            />
          </div>
          <SaveBar>
            <Button
              variant="outline"
              onClick={() => setContent(originalContent)}
              disabled={!hasChanges || writeFileMutation.isPending}
            >
              {m.common_cancel()}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || writeFileMutation.isPending}
            >
              {writeFileMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              {writeFileMutation.isPending
                ? m.config_editor_saving()
                : m.config_editor_save_config()}
            </Button>
          </SaveBar>
        </>
      )}
    </div>
  )
}
