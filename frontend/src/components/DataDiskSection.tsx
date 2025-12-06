import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'

interface DataDiskSectionProps {
  data: Record<string, string>
  onAdd: (name: string, path: string) => Promise<void>
  onRemove: (diskName: string) => Promise<void>
}

export function DataDiskSection({ data, onAdd, onRemove }: DataDiskSectionProps) {
  const [showAddDataDisk, setShowAddDataDisk] = useState(false)
  const [newDataDiskName, setNewDataDiskName] = useState('')
  const [newDataDiskPath, setNewDataDiskPath] = useState('')
  const [addingDataDisk, setAddingDataDisk] = useState(false)
  const [showDataDiskBrowser, setShowDataDiskBrowser] = useState(false)
  const [error, setError] = useState('')

  async function handleAddDataDisk() {
    if (!newDataDiskName.trim() || !newDataDiskPath.trim()) {
      setError('Disk name and path are required')
      return
    }

    setAddingDataDisk(true)
    setError('')
    try {
      await onAdd(newDataDiskName.trim(), newDataDiskPath.trim())
      setNewDataDiskName('')
      setNewDataDiskPath('')
      setShowAddDataDisk(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingDataDisk(false)
    }
  }

  async function handleRemoveDisk(diskName: string) {
    if (!confirm(`Are you sure you want to remove data disk '${diskName}'?`)) return

    setError('')
    try {
      await onRemove(diskName)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-green-900 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Data Disks ({Object.keys(data).length})
        </h3>
        <button
          onClick={() => setShowAddDataDisk(!showAddDataDisk)}
          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
        >
          + Add Data Disk
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

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
        {Object.keys(data).length === 0 ? (
          <div className="text-sm text-green-600 italic">No data disks configured</div>
        ) : (
          Object.entries(data).map(([name, path]) => (
            <div key={name} className="flex justify-between items-center bg-white p-3 rounded border border-green-200">
              <div className="flex items-center gap-3 flex-1">
                <span className="font-semibold text-purple-600 text-sm">{name}</span>
                <span className="font-mono text-sm text-gray-700">{path}</span>
              </div>
              <button
                onClick={() => handleRemoveDisk(name)}
                className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

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
    </div>
  )
}
