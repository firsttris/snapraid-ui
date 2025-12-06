import { useState } from 'react'
import { useRemoveConfig } from '../hooks/queries'
import type { SnapRaidConfig } from '@shared/types'
import { ConfigEditor } from './ConfigEditor'
import { ConfigAddForm } from './ConfigAddForm'
import { ConfigList } from './ConfigList'
import * as m from '../paraglide/messages'

interface ConfigManagerProps {
  config: SnapRaidConfig[]
  onConfigsChanged: () => void
  onClose: () => void
}

export const ConfigManager = ({ config, onConfigsChanged, onClose }: ConfigManagerProps) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<{ path: string; name: string } | null>(null)
  const [error, setError] = useState('')

  const removeConfigMutation = useRemoveConfig()

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
            <ConfigAddForm
              onCancel={() => {
                setShowAddForm(false)
                setError('')
              }}
              onSuccess={() => {
                setShowAddForm(false)
                setError('')
                onConfigsChanged()
              }}
              onError={setError}
            />
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

          <ConfigList
            configs={config}
            onEdit={(cfg) => setEditingConfig({ path: cfg.path, name: cfg.name })}
            onDelete={handleRemoveConfig}
          />
        </div>
      </div>

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
