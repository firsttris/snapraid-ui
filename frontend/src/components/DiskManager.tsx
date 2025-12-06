import { useState, useEffect } from 'react'
import { apiClient } from '../lib/api-client'
import type { ParsedSnapRaidConfig } from '../types'
import { DirectoryBrowser } from './DirectoryBrowser'

interface DiskManagerProps {
  configPath: string
  onUpdate?: () => void
}

export function DiskManager({ configPath, onUpdate }: DiskManagerProps) {
  const [config, setConfig] = useState<ParsedSnapRaidConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  
  // Add Data Disk form state
  const [showAddDataDisk, setShowAddDataDisk] = useState(false)
  const [newDataDiskName, setNewDataDiskName] = useState('')
  const [newDataDiskPath, setNewDataDiskPath] = useState('')
  const [addingDataDisk, setAddingDataDisk] = useState(false)
  
  // Add Parity Disk form state
  const [showAddParity, setShowAddParity] = useState(false)
  const [newParityPath, setNewParityPath] = useState('')
  const [newParityFilename, setNewParityFilename] = useState('snapraid.parity')
  const [addingParity, setAddingParity] = useState(false)

  // Add Exclude form state
  const [showAddExclude, setShowAddExclude] = useState(false)
  const [newExcludePattern, setNewExcludePattern] = useState('')
  const [addingExclude, setAddingExclude] = useState(false)

  // Directory browser state
  const [showDataDiskBrowser, setShowDataDiskBrowser] = useState(false)
  const [showParityBrowser, setShowParityBrowser] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [configPath])

  async function loadConfig() {
    setLoading(true)
    setError('')
    try {
      const parsed = await apiClient.parseSnapRaidConfig(configPath)
      setConfig(parsed)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddDataDisk() {
    if (!newDataDiskName.trim() || !newDataDiskPath.trim()) {
      setError('Disk name and path are required')
      return
    }

    setAddingDataDisk(true)
    setError('')
    try {
      const updated = await apiClient.addDataDisk(configPath, newDataDiskName.trim(), newDataDiskPath.trim())
      setConfig(updated)
      setNewDataDiskName('')
      setNewDataDiskPath('')
      setShowAddDataDisk(false)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingDataDisk(false)
    }
  }

  async function handleAddParity() {
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
      const updated = await apiClient.addParityDisk(configPath, fullPath)
      setConfig(updated)
      setNewParityPath('')
      setNewParityFilename('snapraid.parity')
      setShowAddParity(false)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingParity(false)
    }
  }

  async function handleRemoveDisk(diskName: string | null, diskType: 'data' | 'parity') {
    const confirmMsg = diskType === 'data' 
      ? `Are you sure you want to remove data disk '${diskName}'?`
      : 'Are you sure you want to remove a parity disk?'
    
    if (!confirm(confirmMsg)) return

    setError('')
    try {
      const updated = await apiClient.removeDisk(configPath, diskName, diskType)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleAddExclude() {
    if (!newExcludePattern.trim()) {
      setError('Exclude pattern is required')
      return
    }

    setAddingExclude(true)
    setError('')
    try {
      const updated = await apiClient.addExclude(configPath, newExcludePattern.trim())
      setConfig(updated)
      setNewExcludePattern('')
      setShowAddExclude(false)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingExclude(false)
    }
  }

  async function handleRemoveExclude(pattern: string) {
    if (!confirm(`Are you sure you want to remove exclude pattern '${pattern}'?`)) return

    setError('')
    try {
      const updated = await apiClient.removeExclude(configPath, pattern)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
    }
  }

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="text-gray-600">Loading disk configuration...</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="text-red-600">Failed to load disk configuration</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Parity Disks Section */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-blue-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Parity Disks ({config.parity.length})
          </h3>
          <button
            onClick={() => setShowAddParity(!showAddParity)}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            + Add Parity
          </button>
        </div>

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
          {config.parity.length === 0 ? (
            <div className="text-sm text-blue-600 italic">No parity disks configured</div>
          ) : (
            config.parity.map((path, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-3 rounded border border-blue-200">
                <div className="font-mono text-sm text-gray-700 flex-1">{path}</div>
                <button
                  onClick={() => handleRemoveDisk(null, 'parity')}
                  className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Data Disks Section */}
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-green-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            Data Disks ({Object.keys(config.data).length})
          </h3>
          <button
            onClick={() => setShowAddDataDisk(!showAddDataDisk)}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
          >
            + Add Data Disk
          </button>
        </div>

        {showAddDataDisk && (
          <div className="mb-3 p-3 bg-white rounded border border-green-300">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Disk Name</label>
                <input
                  type="text"
                  value={newDataDiskName}
                  onChange={(e) => setNewDataDiskName(e.target.value)}
                  placeholder="d1, disk1, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Disk Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDataDiskPath}
                    onChange={(e) => setNewDataDiskPath(e.target.value)}
                    placeholder="/mnt/disk1"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowDataDiskBrowser(true)}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                    title="Browse directories"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddDataDisk}
                disabled={addingDataDisk}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {addingDataDisk ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddDataDisk(false)
                  setNewDataDiskName('')
                  setNewDataDiskPath('')
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
          {Object.keys(config.data).length === 0 ? (
            <div className="text-sm text-green-600 italic">No data disks configured</div>
          ) : (
            Object.entries(config.data).map(([name, path]) => (
              <div key={name} className="flex justify-between items-center bg-white p-3 rounded border border-green-200">
                <div className="flex items-center gap-3 flex-1">
                  <span className="font-semibold text-purple-600 text-sm">{name}</span>
                  <span className="font-mono text-sm text-gray-700">{path}</span>
                </div>
                <button
                  onClick={() => handleRemoveDisk(name, 'data')}
                  className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Exclude Patterns Section */}
      <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-orange-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            Exclude Patterns ({config.exclude.length})
          </h3>
          <button
            onClick={() => setShowAddExclude(!showAddExclude)}
            className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors"
          >
            + Add Exclude
          </button>
        </div>

        {showAddExclude && (
          <div className="mb-3 p-3 bg-white rounded border border-orange-300">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exclude Pattern
              <span className="text-xs text-gray-500 ml-2">(e.g., *.bak, /tmp/*, Thumbs.db)</span>
            </label>
            <input
              type="text"
              value={newExcludePattern}
              onChange={(e) => setNewExcludePattern(e.target.value)}
              placeholder="*.bak"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddExclude}
                disabled={addingExclude}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm"
              >
                {addingExclude ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddExclude(false)
                  setNewExcludePattern('')
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
          {config.exclude.length === 0 ? (
            <div className="text-sm text-orange-600 italic">No exclude patterns configured</div>
          ) : (
            config.exclude.map((pattern, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-3 rounded border border-orange-200">
                <div className="font-mono text-sm text-gray-700 flex-1">{pattern}</div>
                <button
                  onClick={() => handleRemoveExclude(pattern)}
                  className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Directory Browser Modals */}
      {showDataDiskBrowser && (
        <DirectoryBrowser
          title="Select Data Disk Directory"
          currentValue={newDataDiskPath}
          onSelect={(path) => {
            setNewDataDiskPath(path)
            setShowDataDiskBrowser(false)
          }}
          onClose={() => setShowDataDiskBrowser(false)}
        />
      )}

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
