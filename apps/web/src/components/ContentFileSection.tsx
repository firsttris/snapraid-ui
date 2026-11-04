import { FileText, FolderOpen, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useAddContentFile, useRemoveContentFile } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { ErrorAlert } from './ErrorAlert'
import { errorMessage, useFeedback } from './Feedback'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ContentFileSectionProps {
  configPath: string
  content: string[]
  onUpdate?: () => void
}

export const ContentFileSection = ({
  configPath,
  content,
  onUpdate,
}: ContentFileSectionProps) => {
  const { confirm } = useFeedback()
  const [showAdd, setShowAdd] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [error, setError] = useState('')

  const addMutation = useAddContentFile()
  const removeMutation = useRemoveContentFile()

  const closeAdd = () => {
    setShowAdd(false)
    setNewPath('')
    setError('')
  }

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newPath.trim()) {
      setError(m.content_section_path_required())
      return
    }
    setError('')
    try {
      await addMutation.mutateAsync({
        configPath,
        contentPath: newPath.trim(),
      })
      closeAdd()
      onUpdate?.()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const handleRemove = async (path: string) => {
    const confirmed = await confirm({
      message: m.content_section_confirm_remove({ path }),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return
    setError('')
    try {
      await removeMutation.mutateAsync({ configPath, contentPath: path })
      onUpdate?.()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            {m.content_section_title()}
            <Badge variant="secondary" className="tabular-nums">
              {content.length}
            </Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {m.content_section_help()}
          </p>
        </div>
        {!showAdd && (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <Plus />
            {m.common_add()}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert error={error} />}

        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-3"
          >
            <div className="flex gap-2">
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder={m.content_section_path_placeholder()}
                aria-label={m.content_section_title()}
                className="bg-background font-mono"
                autoFocus
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowBrowser(true)}
                    aria-label={m.config_manager_browse_button()}
                  >
                    <FolderOpen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {m.config_manager_browse_button()}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={addMutation.isPending || !newPath.trim()}
              >
                {addMutation.isPending ? m.common_adding() : m.common_add()}
              </Button>
              <Button variant="outline" size="sm" onClick={closeAdd}>
                {m.common_cancel()}
              </Button>
            </div>
          </form>
        )}

        {content.length === 0 ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{m.content_section_none()}</AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-col gap-2">
            {content.map((path) => (
              <li
                key={path}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 dark:bg-input/20"
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-sm"
                  title={path}
                >
                  {path}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghostDestructive"
                      size="icon-sm"
                      onClick={() => handleRemove(path)}
                      aria-label={m.common_remove()}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{m.common_remove()}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showBrowser && (
        <DirectoryBrowser
          onSelect={(dir) => {
            setNewPath(`${dir.replace(/\/+$/, '')}/snapraid.content`)
            setShowBrowser(false)
          }}
          onClose={() => setShowBrowser(false)}
          currentValue="/"
          title={m.content_section_select_directory()}
        />
      )}
    </section>
  )
}
