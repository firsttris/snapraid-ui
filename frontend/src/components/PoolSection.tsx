import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'
import * as m from '../paraglide/messages'

interface PoolSectionProps {
  pool?: string
  onPoolChange: (pool: string | undefined) => void
}

export const PoolSection = ({ pool, onPoolChange }: PoolSectionProps) => {
  const [showBrowser, setShowBrowser] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [localPool, setLocalPool] = useState(pool || '')

  const handleAdd = () => {
    if (!localPool.trim()) {
      alert(m.pool_directory_required())
      return
    }
    onPoolChange(localPool.trim())
    setEditMode(false)
  }

  const handleRemove = () => {
    if (confirm(m.pool_no_pool_configured())) {
      onPoolChange(undefined)
      setLocalPool('')
      setEditMode(false)
    }
  }

  const handleBrowserSelect = (path: string) => {
    setLocalPool(path)
    setShowBrowser(false)
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{m.pool_section_title()}</h3>
          {!editMode && !pool && (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
            >
              {m.common_add()}
            </button>
          )}
        </div>

        {!pool && !editMode ? (
          <p className="text-gray-500 text-center py-8">
            {m.pool_no_pool_configured()}
          </p>
        ) : editMode || pool ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {m.pool_directory_label()}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editMode ? localPool : pool}
                  onChange={(e) => editMode && setLocalPool(e.target.value)}
                  placeholder={m.pool_directory_placeholder()}
                  disabled={!editMode}
                  className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {editMode && (
                  <button
                    onClick={() => setShowBrowser(true)}
                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                  >
                    {m.pool_directory_browse()}
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {m.pool_directory_help()}
              </p>
            </div>

            {editMode ? (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setEditMode(false)
                    setLocalPool(pool || '')
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                >
                  {m.common_cancel()}
                </button>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                >
                  {m.common_save()}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setLocalPool(pool || '')
                    setEditMode(true)
                  }}
                  className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  {m.common_edit()}
                </button>
                <button
                  onClick={handleRemove}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                >
                  {m.common_remove()}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={localPool || '/'}
          title={m.pool_select_directory()}
        />
      )}
    </>
  )
}
