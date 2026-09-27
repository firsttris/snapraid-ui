import type { ParityLevel } from '@shared/types'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { useFeedback } from './Feedback'

interface ParityDiskSectionProps {
  parity: ParityLevel[]
  onAdd: (fullPath: string) => Promise<void>
  onRemove: (level: number) => Promise<void>
}

const MAX_PARITY_LEVEL = 6

export const ParityDiskSection = ({
  parity,
  onAdd,
  onRemove,
}: ParityDiskSectionProps) => {
  const { confirm } = useFeedback()
  const [showAddParity, setShowAddParity] = useState(false)
  const [newParityPath, setNewParityPath] = useState('')
  const [newParityFilename, setNewParityFilename] = useState('snapraid.parity')
  const [addingParity, setAddingParity] = useState(false)
  const [showParityBrowser, setShowParityBrowser] = useState(false)
  const [error, setError] = useState('')

  // Levels must stay without gaps, so only the highest one can be removed
  const highestLevel = Math.max(0, ...parity.map((p) => p.level))
  const nextKeyword =
    highestLevel === 0 ? 'parity' : `${highestLevel + 1}-parity`
  const canAdd = highestLevel < MAX_PARITY_LEVEL

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

  const handleRemove = async (level: number) => {
    const confirmed = await confirm({
      message: m.parity_disk_confirm_remove(),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return

    setError('')
    try {
      await onRemove(level)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {m.parity_disk_title()} ({parity.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowAddParity(!showAddParity)}
          disabled={!canAdd}
          title={canAdd ? undefined : m.parity_disk_max_reached()}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-sm text-gray-600 mb-3">
            {m.parity_disk_next_level({ keyword: nextKeyword })}
          </p>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="parity-disk-path"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {m.parity_disk_directory_label()}
              </label>
              <div className="flex gap-2">
                <input
                  id="parity-disk-path"
                  type="text"
                  value={newParityPath}
                  onChange={(e) => setNewParityPath(e.target.value)}
                  placeholder={m.parity_disk_directory_placeholder()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowParityBrowser(true)}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  title={m.parity_disk_browse()}
                >
                  📁 {m.config_manager_browse()}
                </button>
              </div>
            </div>
            <div>
              <label
                htmlFor="parity-disk-filename"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {m.parity_disk_filename_label()}
                <span className="text-xs text-gray-500 ml-2">
                  ({m.parity_disk_filename_label_tooltip()})
                </span>
              </label>
              <input
                id="parity-disk-filename"
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
              type="button"
              onClick={handleAddParity}
              disabled={addingParity}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {addingParity ? `${m.common_adding()}` : m.common_add()}
            </button>
            <button
              type="button"
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
          <div className="text-sm text-blue-600 italic">
            {m.parity_disk_no_disks()}
          </div>
        ) : (
          parity.map((p) => (
            <div
              key={p.keyword}
              className="flex justify-between items-center bg-white p-3 rounded border border-blue-200"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-blue-700">
                  {p.keyword}
                  {p.paths.length > 1 && (
                    <span className="ml-2 font-normal text-gray-500">
                      {m.parity_disk_split({ count: p.paths.length })}
                    </span>
                  )}
                </div>
                {p.paths.map((path) => (
                  <div
                    key={path}
                    className="font-mono text-sm text-gray-700 truncate"
                    title={path}
                  >
                    {path}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p.level)}
                disabled={p.level !== highestLevel}
                title={
                  p.level !== highestLevel
                    ? m.parity_disk_remove_highest_only()
                    : undefined
                }
                className="ml-3 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-500"
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
