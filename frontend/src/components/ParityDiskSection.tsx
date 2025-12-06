import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'
import * as m from '../paraglide/messages'

interface ParityDiskSectionProps {
  parity: string[]
  onAdd: (fullPath: string) => Promise<void>
  onRemove: () => Promise<void>
}

export const ParityDiskSection = ({ parity, onAdd, onRemove }: ParityDiskSectionProps) => {
  const [showAddParity, setShowAddParity] = useState(false)
  const [newParityPath, setNewParityPath] = useState('')
  const [newParityFilename, setNewParityFilename] = useState('snapraid.parity')
  const [addingParity, setAddingParity] = useState(false)
  const [showParityBrowser, setShowParityBrowser] = useState(false)
  const [error, setError] = useState('')

  const handleAddParity = async () => {
    if (!newParityPath.trim()) {
      setError(m.parity_disk_directory_required())
      return
    }

    if (!newParityFilename.trim()) {
      setError(m.parity_disk_filename_required())
      return
    }

    if (!newParityFilename.endsWith('.parity')) {
      setError(m.parity_disk_filename_must_end_parity())
      return
    }

    const fullPath = `${newParityPath}/${newParityFilename}`

    setAddingParity(true)
    setError('')
    try {
      await onAdd(fullPath)
      setNewParityPath('')
      setNewParityFilename('snapraid.parity')
      setShowAddParity(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingParity(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm(m.parity_disk_confirm_remove())) return
    
    setError('')
    try {
      await onRemove()
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {m.parity_disk_title()} ({parity.length})
        </h3>
        <button
          onClick={() => setShowAddParity(!showAddParity)}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          + {m.parity_disk_add_parity()}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showAddParity && (
        <div className="mb-3 p-3 bg-white rounded border border-blue-300">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{m.parity_disk_directory_label()}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newParityPath}
                  onChange={(e) => setNewParityPath(e.target.value)}
                  placeholder={m.parity_disk_directory_placeholder()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  onClick={() => setShowParityBrowser(true)}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  title={m.parity_disk_browse()}
                >
                  📁 {m.config_manager_browse()}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {m.parity_disk_filename_label()}
                <span className="text-xs text-gray-500 ml-2">({m.parity_disk_filename_label_tooltip()})</span>
              </label>
              <input
                type="text"
                value={newParityFilename}
                onChange={(e) => setNewParityFilename(e.target.value)}
                placeholder={m.parity_disk_filename_placeholder()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleAddParity}
              disabled={addingParity}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {addingParity ? `${m.common_adding()}` : m.common_add()}
            </button>
            <button
              onClick={() => {
                setShowAddParity(false)
                setNewParityPath('')
                setNewParityFilename('snapraid.parity')
                setError('')
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
            >
              {m.common_cancel()}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {parity.length === 0 ? (
          <div className="text-sm text-blue-600 italic">{m.parity_disk_no_disks()}</div>
        ) : (
          parity.map((path, index) => (
            <div key={index} className="flex justify-between items-center bg-white p-3 rounded border border-blue-200">
              <div className="font-mono text-sm text-gray-700 flex-1">{path}</div>
              <button
                onClick={handleRemove}
                className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
              >
                {m.common_remove()}
              </button>
            </div>
          ))
        )}
      </div>

      {showParityBrowser && (
        <DirectoryBrowser
          title={m.parity_disk_select_directory()}
          currentValue={newParityPath}
          onSelect={(path) => {
            setNewParityPath(path)
            setShowParityBrowser(false)
          }}
          onClose={() => setShowParityBrowser(false)}
        />
      )}
    </div>
  )
}
