import { useState } from 'react'

interface ExcludePatternSectionProps {
  exclude: string[]
  onAdd: (pattern: string) => Promise<void>
  onRemove: (pattern: string) => Promise<void>
}

export const ExcludePatternSection = ({ exclude, onAdd, onRemove }: ExcludePatternSectionProps) => {
  const [showAddExclude, setShowAddExclude] = useState(false)
  const [newExcludePattern, setNewExcludePattern] = useState('')
  const [addingExclude, setAddingExclude] = useState(false)
  const [error, setError] = useState('')

  const handleAddExclude = async () => {
    if (!newExcludePattern.trim()) {
      setError('Exclude pattern is required')
      return
    }

    setAddingExclude(true)
    setError('')
    try {
      await onAdd(newExcludePattern.trim())
      setNewExcludePattern('')
      setShowAddExclude(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingExclude(false)
    }
  }

  const handleRemoveExclude = async (pattern: string) => {
    if (!confirm(`Are you sure you want to remove exclude pattern '${pattern}'?`)) return

    setError('')
    try {
      await onRemove(pattern)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-orange-900 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Exclude Patterns ({exclude.length})
        </h3>
        <button
          onClick={() => setShowAddExclude(!showAddExclude)}
          className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors"
        >
          + Add Exclude
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

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
        {exclude.length === 0 ? (
          <div className="text-sm text-orange-600 italic">No exclude patterns configured</div>
        ) : (
          exclude.map((pattern, index) => (
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
  )
}
