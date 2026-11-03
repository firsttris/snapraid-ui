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
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">{m.config_manager_no_configs()}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.config_manager_no_configs_description()}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
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
