import { FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { useBasePath, useCreateConfig } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { errorMessage } from './Feedback'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface ConfigCreateFormProps {
  onCancel: () => void
  // Path of the created config, to open it in the editor
  onSuccess: (path: string, name: string) => void
}

// File name suggested for a config name, e.g. "Media Server" -> "media-server.conf"
const fileNameFromName = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}.conf` : ''
}

export const ConfigCreateForm = ({
  onCancel,
  onSuccess,
}: ConfigCreateFormProps) => {
  const [name, setName] = useState('')
  const [fileName, setFileName] = useState('')
  // Keep deriving the file name from the name until the user types one
  const [fileNameEdited, setFileNameEdited] = useState(false)
  const [error, setError] = useState('')

  const { data: basePath } = useBasePath()
  const createConfigMutation = useCreateConfig()

  const canSubmit =
    name.trim() !== '' &&
    fileName.trim() !== '' &&
    !createConfigMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    createConfigMutation.mutate(
      { name: name.trim(), fileName: fileName.trim() },
      {
        onSuccess: (result) => onSuccess(result.path, name.trim()),
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4"
    >
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <FilePlus2 className="size-4 text-muted-foreground" />
        {m.config_manager_create_new()}
      </h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor="config-create-name">
          {m.config_manager_name_label()}
        </Label>
        <Input
          id="config-create-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!fileNameEdited) setFileName(fileNameFromName(e.target.value))
          }}
          placeholder={m.config_manager_name_placeholder()}
          className="bg-background"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="config-create-file">
          {m.config_manager_file_name_label()}
        </Label>
        <Input
          id="config-create-file"
          type="text"
          value={fileName}
          onChange={(e) => {
            setFileName(e.target.value)
            setFileNameEdited(true)
          }}
          placeholder="snapraid.conf"
          className="bg-background font-mono"
        />
        {basePath && (
          <p className="text-xs text-muted-foreground">
            {m.config_manager_file_name_help({ basePath })}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {m.config_manager_create_button()}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
      </div>
    </form>
  )
}
