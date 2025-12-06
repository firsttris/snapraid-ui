import { useState } from 'react'
import * as m from '../paraglide/messages'

interface UndeleteAdvancedOptionsProps {
  diskFilter?: string
  onDiskFilterChange: (filter: string | undefined) => void
}

export const UndeleteAdvancedOptions = ({ diskFilter, onDiskFilterChange }: UndeleteAdvancedOptionsProps) => {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
      >
        <span>{showAdvanced ? '▼' : '▶'}</span>
        <span>{m.undelete_advanced_options()}</span>
      </button>
      
      {showAdvanced && (
        <div className="mt-3 p-4 bg-gray-50 rounded">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {m.undelete_disk_filter_label()}
          </label>
          <input
            type="text"
            value={diskFilter}
            onChange={(e) => onDiskFilterChange(e.target.value)}
            placeholder={m.undelete_disk_filter_placeholder()}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-sm text-gray-500">
            {m.undelete_disk_filter_help()}
          </p>
        </div>
      )}
    </div>
  )
}
