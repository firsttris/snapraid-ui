import type { SnapRaidConfig } from '@shared/types'
import { FileText } from 'lucide-react'
import { useConfigChecks } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { ConfigListItem } from './ConfigListItem'

interface ConfigListProps {
  configs: SnapRaidConfig[]
  onEdit: (config: SnapRaidConfig) => void
  onDelete: (config: SnapRaidConfig) => void
  onRename: (config: SnapRaidConfig, name: string) => void
  onToggle: (config: SnapRaidConfig, enabled: boolean) => void
}

export const ConfigList = ({
  configs,
  onEdit,
  onDelete,
  onRename,
  onToggle,
}: ConfigListProps) => {
  const { data: checks } = useConfigChecks()

  if (configs.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText
          size={64}
          strokeWidth={1.25}
          className="mx-auto text-gray-300 mb-4"
        />
        <p className="text-gray-500 text-lg">{m.config_manager_no_configs()}</p>
        <p className="text-gray-400 text-sm mt-1">
          {m.config_manager_no_configs_description()}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {configs.map((cfg) => (
        <ConfigListItem
          key={cfg.path}
          config={cfg}
          check={checks?.find((check) => check.path === cfg.path)}
          onEdit={() => onEdit(cfg)}
          onDelete={() => onDelete(cfg)}
          onRename={(name) => onRename(cfg, name)}
          onToggle={(enabled) => onToggle(cfg, enabled)}
        />
      ))}
    </div>
  )
}
