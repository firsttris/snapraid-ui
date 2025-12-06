import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'

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
      setError('Parity directory path is required')
      return
    }

    if (!newParityFilename.trim()) {
      setError('Parity filename is required')
      return
    }

    if (!newParityFilename.endsWith('.parity')) {
      setError('Parity filename must end with .parity')
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
    if (!confirm('Are you sure you want to remove a parity disk?')) return
    
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
          Parity Disks ({parity.length})
        </h3>
        <button
          onClick={() => setShowAddParity(!showAddParity)}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          + Add Parity
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Parity Directory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newParityPath}
                  onChange={(e) => setNewParityPath(e.target.value)}
                  placeholder="/mnt/parity1"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  onClick={() => setShowParityBrowser(true)}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  title="Browse directories"
                >
                  📁 Browse
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parity Filename
                <span className="text-xs text-gray-500 ml-2">(must end with .parity)</span>
              </label>
              <input
                type="text"
                value={newParityFilename}
                onChange={(e) => setNewParityFilename(e.target.value)}
                placeholder="snapraid.parity"
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
              {addingParity ? 'Adding...' : 'Add'}
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
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {parity.length === 0 ? (
          <div className="text-sm text-blue-600 italic">No parity disks configured</div>
        ) : (
          parity.map((path, index) => (
            <div key={index} className="flex justify-between items-center bg-white p-3 rounded border border-blue-200">
              <div className="font-mono text-sm text-gray-700 flex-1">{path}</div>
              <button
                onClick={handleRemove}
                className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {showParityBrowser && (
        <DirectoryBrowser
          title="Select Parity Directory"
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
