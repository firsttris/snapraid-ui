import { useState } from 'react'
import { useFilesystem, useAddConfig, useRemoveConfig } from '../hooks/queries'
import type { SnapRaidConfig } from '@shared/types'
import { ConfigEditor } from './ConfigEditor'
import * as m from '../paraglide/messages'

interface FileBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
}

export const FileBrowser = ({ onSelect, onClose }: FileBrowserProps) => {
  const [currentPath, setCurrentPath] = useState<string>('')
  
  // Use TanStack Query hook
  const { data, isLoading: loading, error } = useFilesystem(currentPath, 'conf')
  
  const entries = data?.entries || []
  const actualPath = data?.path || currentPath

  const goUp = () => {
    const parts = actualPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath('/' + parts.join('/'))
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">{m.config_manager_select_file()}</h3>
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
              disabled={actualPath === '/'}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ↑ {m.directory_browser_up()}
            </button>
            <div className="flex-1 text-sm text-gray-600 font-mono">
              {actualPath || '/'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-gray-500">{m.common_loading()}</div>}
          {error && <div className="text-red-600 text-sm">{String(error)}</div>}
          
          {!loading && !error && entries.length === 0 && (
            <div className="text-center text-gray-500">{m.config_manager_no_files_found()}</div>
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
  onClose: () => void
}

export const ConfigManager = ({ config, onConfigsChanged, onClose }: ConfigManagerProps) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [editingConfig, setEditingConfig] = useState<{ path: string; name: string } | null>(null)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigPath, setNewConfigPath] = useState('')
  const [error, setError] = useState('')

  // TanStack Query mutations
  const addConfigMutation = useAddConfig()
  const removeConfigMutation = useRemoveConfig()

  const handleAddConfig = async () => {
    if (!newConfigName.trim() || !newConfigPath.trim()) {
      setError(m.config_manager_name_and_path_required())
      return
    }

    addConfigMutation.mutate(
      { name: newConfigName, path: newConfigPath, enabled: true },
      {
        onSuccess: () => {
          setNewConfigName('')
          setNewConfigPath('')
          setShowAddForm(false)
          setError('')
          onConfigsChanged()
        },
        onError: (err) => {
          setError(String(err))
        }
      }
    )
  }

  const handleRemoveConfig = async (path: string) => {
    if (!confirm(m.config_manager_remove_confirm())) return

    removeConfigMutation.mutate(path, {
      onSuccess: () => {
        onConfigsChanged()
      },
      onError: (err) => {
        setError(String(err))
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900">{m.config_manager_title()}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {showAddForm ? (
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
                    onClick={() => {
                      setShowAddForm(false)
                      setNewConfigName('')
                      setNewConfigPath('')
                      setError('')
                    }}
                    className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    {m.common_cancel()}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-6 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-600 hover:text-blue-600 font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {m.config_manager_add_config()}
            </button>
          )}

          {/* Configuration List */}
          <div className="space-y-3">
            {config.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 text-lg">{m.config_manager_no_configs()}</p>
                <p className="text-gray-400 text-sm mt-1">{m.config_manager_no_configs_description()}</p>
              </div>
            ) : (
              config.map((cfg) => (
                <div
                  key={cfg.path}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-semibold text-gray-900 text-lg">{cfg.name}</h4>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.enabled ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {cfg.enabled ? m.config_manager_enabled() : m.config_manager_disabled()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 font-mono truncate">{cfg.path}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingConfig({ path: cfg.path, name: cfg.name })}
                      className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {m.config_manager_edit()}
                    </button>
                    <button
                      onClick={() => handleRemoveConfig(cfg.path)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {m.config_manager_delete()}
                    </button>
                  </div>
                </div>
              ))
            )}
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

      {editingConfig && (
        <ConfigEditor
          configPath={editingConfig.path}
          configName={editingConfig.name}
          onClose={() => setEditingConfig(null)}
          onSaved={() => {
            onConfigsChanged()
          }}
        />
      )}
    </div>
  )
}
