import type { ConfigFileCheck, SnapRaidConfig } from '@shared/types'
import {
  AlertTriangle,
  Check,
  MoreHorizontal,
  Pencil,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Switch } from './ui/switch'

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
  // The rename field keeps the focus the closing menu would hand back to its button
  const focusRename = useRef(false)
  const switchId = useId()

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
      {/* Hidden arrays leave the switcher, their schedules keep running */}
      <div className="flex w-28 shrink-0 items-center gap-2">
        <Switch
          id={switchId}
          checked={config.enabled}
          onCheckedChange={onToggle}
          aria-label={m.config_manager_toggle_label({ name: config.name })}
        />
        <label
          htmlFor={switchId}
          className="cursor-pointer text-xs text-muted-foreground"
        >
          {config.enabled
            ? m.config_manager_shown()
            : m.config_manager_hidden()}
        </label>
      </div>

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
          <Pencil />
          {m.config_manager_edit()}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.config_manager_more({ name: config.name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (focusRename.current) event.preventDefault()
              focusRename.current = false
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                focusRename.current = true
                setName(config.name)
                setRenaming(true)
              }}
            >
              <TextCursorInput />
              {m.config_manager_rename()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {m.config_manager_delete()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
