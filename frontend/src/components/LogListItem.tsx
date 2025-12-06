import type { LogFile } from '@shared/types'
import { formatFileSize, formatDate } from '../lib/utils'

interface LogListItemProps {
  log: LogFile
  isSelected: boolean
  onSelect: (filename: string) => void
  onDelete: (filename: string) => void
}

export const LogListItem = ({ log, isSelected, onSelect, onDelete }: LogListItemProps) => {
  return (
    <div
      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={() => onSelect(log.filename)}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              log.command === 'sync' ? 'bg-green-100 text-green-800' :
              log.command === 'scrub' ? 'bg-purple-100 text-purple-800' :
              log.command === 'status' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {log.command}
            </span>
            <span className="text-sm text-gray-600">
              {formatDate(log.timestamp)}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {log.filename} • {formatFileSize(log.size)}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(log.filename)
          }}
          className="text-red-600 hover:text-red-800 p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
