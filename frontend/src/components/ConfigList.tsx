import type { SnapRaidConfig } from '@shared/types'
import { ConfigListItem } from './ConfigListItem'
import * as m from '../paraglide/messages'

interface ConfigListProps {
  configs: SnapRaidConfig[]
  onEdit: (config: SnapRaidConfig) => void
  onDelete: (path: string) => void
}

export const ConfigList = ({ configs, onEdit, onDelete }: ConfigListProps) => {
  if (configs.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 text-lg">{m.config_manager_no_configs()}</p>
        <p className="text-gray-400 text-sm mt-1">{m.config_manager_no_configs_description()}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {configs.map((cfg) => (
        <ConfigListItem
          key={cfg.path}
          config={cfg}
          onEdit={() => onEdit(cfg)}
          onDelete={() => onDelete(cfg.path)}
        />
      ))}
    </div>
  )
}
