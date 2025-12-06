import { useState } from 'react'
import { useFilesystem } from '../lib/api-client'

interface DirectoryBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
  title?: string
  currentValue?: string
}

export const DirectoryBrowser = ({ onSelect, onClose, title = 'Select Directory', currentValue }: DirectoryBrowserProps) => {
  const [currentPath, setCurrentPath] = useState<string>(currentValue || '')
  
  // TanStack Query hook
  const { data, isLoading: loading, error } = useFilesystem(currentPath, 'directories')
  
  const entries = data?.entries || []
  const actualPath = data?.path || currentPath

  const goUp = () => {
    const parts = actualPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath('/' + parts.join('/'))
  }

  const handleSelect = () => {
    onSelect(actualPath)
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">{title}</h3>
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
              ↑ Up
            </button>
            <div className="flex-1 text-sm text-gray-600 font-mono">
              {actualPath || '/'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-gray-500">Loading...</div>}
          {error && <div className="text-red-600 text-sm">{String(error)}</div>}
          
          {!loading && !error && entries.length === 0 && (
            <div className="text-center text-gray-500">No directories found</div>
          )}

          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => setCurrentPath(entry.path)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-2"
              >
                <span className="text-lg">📁</span>
                <span className="font-medium">{entry.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Selected: <span className="font-mono">{actualPath || '/'}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
