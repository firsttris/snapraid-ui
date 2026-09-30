import { useState } from 'react'
import { useBasePath, useCreateConfig } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { errorMessage } from './Feedback'

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

const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all'

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
      className="mb-6 p-5 bg-linear-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200"
    >
      <h3 className="text-lg font-semibold mb-4 text-gray-900">
        {m.config_manager_create_new()}
      </h3>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="config-create-name"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {m.config_manager_name_label()}
          </label>
          <input
            id="config-create-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!fileNameEdited) setFileName(fileNameFromName(e.target.value))
            }}
            placeholder={m.config_manager_name_placeholder()}
            className={inputClass}
            // biome-ignore lint/a11y/noAutofocus: focus the first field when the create form opens
            autoFocus
          />
        </div>
        <div>
          <label
            htmlFor="config-create-file"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {m.config_manager_file_name_label()}
          </label>
          <input
            id="config-create-file"
            type="text"
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value)
              setFileNameEdited(true)
            }}
            placeholder="snapraid.conf"
            className={`${inputClass} font-mono text-sm`}
          />
          {basePath && (
            <p className="mt-1.5 text-xs text-gray-500">
              {m.config_manager_file_name_help({ basePath })}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={!canSubmit} className="rounded-lg">
            {m.config_manager_create_button()}
          </Button>
          <Button
            variant="secondary"
            onClick={onCancel}
            className="bg-white rounded-lg"
          >
            {m.common_cancel()}
          </Button>
        </div>
      </div>
    </form>
  )
}
