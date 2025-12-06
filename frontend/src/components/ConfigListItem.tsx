import type { SnapRaidConfig } from '@shared/types'
import * as m from '../paraglide/messages'

interface ConfigListItemProps {
  config: SnapRaidConfig
  onEdit: () => void
  onDelete: () => void
}

export const ConfigListItem = ({ config, onEdit, onDelete }: ConfigListItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="font-semibold text-gray-900 text-lg">{config.name}</h4>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${config.enabled ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
            {config.enabled ? m.config_manager_enabled() : m.config_manager_disabled()}
          </span>
        </div>
        <div className="text-sm text-gray-500 font-mono truncate">{config.path}</div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={onEdit}
          className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {m.config_manager_edit()}
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {m.config_manager_delete()}
        </button>
      </div>
    </div>
  )
}
