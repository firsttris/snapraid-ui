import { useState } from 'react'
import { useAddConfig } from '../hooks/queries'
import { FileBrowser } from './FileBrowser'
import * as m from '../paraglide/messages'

interface ConfigAddFormProps {
  onCancel: () => void
  onSuccess: () => void
  onError: (error: string) => void
}

export const ConfigAddForm = ({ onCancel, onSuccess, onError }: ConfigAddFormProps) => {
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigPath, setNewConfigPath] = useState('')

  const addConfigMutation = useAddConfig()

  const handleAddConfig = async () => {
    if (!newConfigName.trim() || !newConfigPath.trim()) {
      onError(m.config_manager_name_and_path_required())
      return
    }

    addConfigMutation.mutate(
      { name: newConfigName, path: newConfigPath, enabled: true },
      {
        onSuccess: () => {
          setNewConfigName('')
          setNewConfigPath('')
          onSuccess()
        },
        onError: (err) => {
          onError(String(err))
        }
      }
    )
  }

  return (
    <>
      <div className="mb-6 p-5 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">{m.config_manager_add_config()}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {m.config_manager_name_label()}
            </label>
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              placeholder={m.config_manager_name_placeholder()}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {m.config_manager_path_label()}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newConfigPath}
                onChange={(e) => setNewConfigPath(e.target.value)}
                placeholder={m.config_manager_path_placeholder()}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm"
              />
              <button
                onClick={() => setShowFileBrowser(true)}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                {m.config_manager_browse()}
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleAddConfig}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              {m.config_manager_add_configuration()}
            </button>
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              {m.common_cancel()}
            </button>
          </div>
        </div>
      </div>

      {showFileBrowser && (
        <FileBrowser
          onSelect={(path) => {
            setNewConfigPath(path)
            setShowFileBrowser(false)
          }}
          onClose={() => setShowFileBrowser(false)}
        />
      )}
    </>
  )
}
