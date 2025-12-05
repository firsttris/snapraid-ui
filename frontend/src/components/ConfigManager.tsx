import { useState, useEffect } from 'react'
import { apiClient } from '../lib/api-client'
import type { SnapRaidConfig } from '../types'

interface FileBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
}

export function FileBrowser({ onSelect, onClose }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<Array<{ name: string; isDirectory: boolean; path: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  async function loadDirectory(path?: string) {
    setLoading(true)
    setError('')
    try {
      const result = await apiClient.browseFilesystem(path)
      setCurrentPath(result.path)
      setEntries(result.entries)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function goUp() {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath('/' + parts.join('/'))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">Select SnapRAID Config File</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={goUp}
              disabled={currentPath === '/'}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ↑ Up
            </button>
            <div className="flex-1 text-sm text-gray-600 font-mono">
              {currentPath || '/'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-gray-500">Loading...</div>}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          
          {!loading && !error && entries.length === 0 && (
            <div className="text-center text-gray-500">No .conf files or directories found</div>
          )}

          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => {
                  if (entry.isDirectory) {
                    setCurrentPath(entry.path)
                  } else {
                    onSelect(entry.path)
                  }
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-2"
              >
                <span className="text-lg">
                  {entry.isDirectory ? '📁' : '📄'}
                </span>
                <span className={entry.isDirectory ? 'font-medium' : ''}>
                  {entry.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ConfigManagerProps {
  config: SnapRaidConfig[]
  onConfigsChanged: () => void
}

export function ConfigManager({ config, onConfigsChanged }: ConfigManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigPath, setNewConfigPath] = useState('')
  const [error, setError] = useState('')

  async function handleAddConfig() {
    if (!newConfigName.trim() || !newConfigPath.trim()) {
      setError('Name and path are required')
      return
    }

    try {
      await apiClient.addConfig(newConfigName, newConfigPath, true)
      setNewConfigName('')
      setNewConfigPath('')
      setShowAddForm(false)
      setError('')
      onConfigsChanged()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleRemoveConfig(path: string) {
    if (!confirm('Are you sure you want to remove this config?')) return

    try {
      await apiClient.removeConfig(path)
      onConfigsChanged()
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Manage Configurations</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          + Add Config
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded border">
          <h3 className="font-medium mb-3">Add New Configuration</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                placeholder="e.g., Media, Games, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Config File Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newConfigPath}
                  onChange={(e) => setNewConfigPath(e.target.value)}
                  placeholder="/etc/snapraid.conf"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => setShowFileBrowser(true)}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Browse...
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewConfigName('')
                  setNewConfigPath('')
                  setError('')
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {config.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No configurations yet. Add one to get started!</p>
        ) : (
          config.map((cfg) => (
            <div
              key={cfg.path}
              className="flex items-center justify-between p-3 bg-gray-50 rounded border"
            >
              <div className="flex-1">
                <div className="font-medium">{cfg.name}</div>
                <div className="text-sm text-gray-600 font-mono">{cfg.path}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded ${cfg.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {cfg.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => handleRemoveConfig(cfg.path)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
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
    </div>
  )
}
