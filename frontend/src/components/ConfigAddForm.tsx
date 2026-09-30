import { useState } from 'react'
import { useAddConfig, useBasePath } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { errorMessage } from './Feedback'
import { FileBrowser } from './FileBrowser'

interface ConfigAddFormProps {
  onCancel: () => void
  onSuccess: () => void
}

// Suggested name for a picked file, e.g. /etc/snapraid-media.conf -> "snapraid-media"
const nameFromPath = (path: string) =>
  path.replace(/^.*[/\\]/, '').replace(/\.conf$/, '')

const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all'

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
        className="mb-6 p-5 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200"
      >
        <h3 className="text-lg font-semibold mb-4 text-gray-900">
          {m.config_manager_add_existing()}
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="config-add-path"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {m.config_manager_path_label()}
            </label>
            <div className="flex gap-2">
              <input
                id="config-add-path"
                type="text"
                value={path}
                onChange={(e) => changePath(e.target.value)}
                placeholder={m.config_manager_path_placeholder()}
                className={`${inputClass} flex-1 font-mono text-sm`}
                // biome-ignore lint/a11y/noAutofocus: focus the first field when the add form opens
                autoFocus
              />
              <Button
                variant="secondary"
                onClick={() => setShowFileBrowser(true)}
                className="bg-white rounded-lg"
              >
                {m.config_manager_browse()}
              </Button>
            </div>
            {basePath && (
              <p className="mt-1.5 text-xs text-gray-500">
                {m.config_manager_path_help({ basePath })}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="config-add-name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {m.config_manager_name_label()}
            </label>
            <input
              id="config-add-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameEdited(true)
              }}
              placeholder={m.config_manager_name_placeholder()}
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={!canSubmit} className="rounded-lg">
              {m.config_manager_add_configuration()}
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
