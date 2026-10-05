import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { useAddConfig, useBasePath } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { errorMessage } from './Feedback'
import { FileBrowser } from './FileBrowser'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface ConfigAddFormProps {
  onCancel: () => void
  onSuccess: () => void
}

// Suggested name for a picked file, e.g. /etc/snapraid-media.conf -> "snapraid-media"
const nameFromPath = (path: string) =>
  path.replace(/^.*[/\\]/, '').replace(/\.conf$/, '')

export const ConfigAddForm = ({ onCancel, onSuccess }: ConfigAddFormProps) => {
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  // Keep suggesting names from the path until the user types one
  const [nameEdited, setNameEdited] = useState(false)
  const [error, setError] = useState('')

  const { data: basePath } = useBasePath()
  const addConfigMutation = useAddConfig()

  const changePath = (value: string) => {
    setPath(value)
    if (!nameEdited) setName(nameFromPath(value))
  }

  const canSubmit =
    name.trim() !== '' && path.trim() !== '' && !addConfigMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    addConfigMutation.mutate(
      { name: name.trim(), path: path.trim(), enabled: true },
      {
        onSuccess,
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4"
      >
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <FolderOpen className="size-4 text-muted-foreground" />
          {m.config_manager_add_existing()}
        </h3>
        <div className="flex flex-col gap-2">
          <Label htmlFor="config-add-path">
            {m.config_manager_path_label()}
          </Label>
          <div className="flex gap-2">
            <Input
              id="config-add-path"
              type="text"
              value={path}
              onChange={(e) => changePath(e.target.value)}
              placeholder={m.config_manager_path_placeholder()}
              className="flex-1 bg-background font-mono"
              autoFocus
            />
            <Button variant="outline" onClick={() => setShowFileBrowser(true)}>
              {m.config_manager_browse()}
            </Button>
          </div>
          {basePath && (
            <p className="text-xs text-muted-foreground">
              {m.config_manager_path_help({ basePath })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="config-add-name">
            {m.config_manager_name_label()}
          </Label>
          <Input
            id="config-add-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameEdited(true)
            }}
            placeholder={m.config_manager_name_placeholder()}
            className="bg-background"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSubmit}>
            {m.config_manager_add_configuration()}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
        </div>
      </form>

      {showFileBrowser && (
        <FileBrowser
          onSelect={(selected) => {
            changePath(selected)
            setShowFileBrowser(false)
          }}
          onClose={() => setShowFileBrowser(false)}
        />
      )}
    </>
  )
}
