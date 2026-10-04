import type { ConfigFileCheck, SnapRaidConfig } from '@shared/types'
import {
  AlertTriangle,
  Check,
  Pencil,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ConfigListItemProps {
  config: SnapRaidConfig
  check?: ConfigFileCheck
  onEdit: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onToggle: (enabled: boolean) => void
}

const CheckSummary = ({ check }: { check?: ConfigFileCheck }) => {
  if (!check) return null

  if (!check.exists || check.error) {
    return (
      <Badge variant="destructive" title={check.error}>
        <AlertTriangle />
        {check.exists
          ? m.config_manager_file_unreadable()
          : m.config_manager_file_missing()}
      </Badge>
    )
  }

  const summary = m.config_manager_summary({
    data: check.dataDisks,
    parity: check.parityLevels,
    content: check.contentFiles,
  })
  const incomplete =
    check.dataDisks === 0 ||
    check.parityLevels === 0 ||
    check.contentFiles === 0
  if (incomplete) {
    return (
      <Badge variant="warning" title={m.config_manager_incomplete()}>
        <AlertTriangle />
        {summary}
      </Badge>
    )
  }
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {summary}
    </span>
  )
}

const IconAction = ({
  label,
  onClick,
  destructive = false,
  children,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={destructive ? 'ghostDestructive' : 'ghost'}
        size="icon-sm"
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

export const ConfigListItem = ({
  config,
  check,
  onEdit,
  onDelete,
  onRename,
  onToggle,
}: ConfigListItemProps) => {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(config.name)

  const fileMissing = check !== undefined && !check.exists

  const submitRename = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== config.name) onRename(trimmed)
    setRenaming(false)
  }

  const cancelRename = () => {
    setName(config.name)
    setRenaming(false)
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-4 transition-colors sm:flex-nowrap',
        config.enabled ? 'bg-card hover:bg-accent/40' : 'bg-muted/40',
      )}
    >
      <Switch
        checked={config.enabled}
        onCheckedChange={onToggle}
        aria-label={m.config_manager_toggle_label({ name: config.name })}
        title={
          config.enabled
            ? m.config_manager_enabled()
            : m.config_manager_disabled()
        }
      />

      <div className="min-w-0 flex-1 basis-48">
        {renaming ? (
          <form
            // ConfigManager keeps the dialog open on Escape in here
            data-escape-local=""
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              submitRename()
            }}
          >
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Only leave the rename, not the whole dialog
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRename()
                }
              }}
              aria-label={m.config_manager_name_label()}
              className="h-8 min-w-0 flex-1 font-medium"
              autoFocus
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label={m.common_save()}
              disabled={!name.trim()}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.common_cancel()}
              onClick={cancelRename}
            >
              <X />
            </Button>
          </form>
        ) : (
          <div
            className={cn(
              'truncate text-sm font-semibold',
              !config.enabled && 'text-muted-foreground',
            )}
          >
            {config.name}
          </div>
        )}
        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {config.path}
        </div>
        {check && (
          <div className="mt-1.5">
            <CheckSummary check={check} />
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={fileMissing}
        >
          <Settings2 />
          {m.config_manager_edit()}
        </Button>
        <IconAction
          label={m.config_manager_rename()}
          onClick={() => {
            setName(config.name)
            setRenaming(true)
          }}
        >
          <Pencil />
        </IconAction>
        <IconAction
          label={m.config_manager_delete()}
          onClick={onDelete}
          destructive
        >
          <Trash2 />
        </IconAction>
      </div>
    </div>
  )
}
