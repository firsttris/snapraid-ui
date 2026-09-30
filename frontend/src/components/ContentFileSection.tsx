import { FileText, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAddContentFile, useRemoveContentFile } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { DirectoryBrowser } from './DirectoryBrowser'
import { errorMessage, useFeedback } from './Feedback'

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
    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-semibold text-purple-900 flex items-center gap-2">
          <FileText size={20} />
          {m.content_section_title()} ({content.length})
        </h3>
        {!showAdd && (
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus size={14} />
            {m.common_add()}
          </Button>
        )}
      </div>
      <p className="mb-3 text-sm text-purple-700">{m.content_section_help()}</p>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="mb-3 p-3 bg-white rounded border border-purple-200"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder={m.content_section_path_placeholder()}
              aria-label={m.content_section_title()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
              // biome-ignore lint/a11y/noAutofocus: focus the field when the add form opens
              autoFocus
            />
            <Button variant="secondary" onClick={() => setShowBrowser(true)}>
              {m.config_manager_browse_button()}
            </Button>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              type="submit"
              size="sm"
              disabled={addMutation.isPending || !newPath.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {addMutation.isPending ? m.common_adding() : m.common_add()}
            </Button>
            <Button variant="secondary" size="sm" onClick={closeAdd}>
              {m.common_cancel()}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {content.length === 0 ? (
          <div className="text-sm font-medium text-red-600">
            {m.content_section_none()}
          </div>
        ) : (
          content.map((path) => (
            <div
              key={path}
              className="flex justify-between items-center bg-white p-3 rounded border border-purple-200"
            >
              <div className="font-mono text-sm text-gray-700 flex-1 truncate">
                {path}
              </div>
              <Button
                variant="ghostDanger"
                size="iconSm"
                onClick={() => handleRemove(path)}
                aria-label={m.common_remove()}
                title={m.common_remove()}
                className="ml-3"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))
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
    </div>
  )
}
