import type { ConfigFileCheck, SnapRaidConfig } from '@shared/types'
import { AlertTriangle, Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { Button } from './Button'

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
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-red-700"
        title={check.error}
      >
        <AlertTriangle size={14} />
        {check.exists
          ? m.config_manager_file_unreadable()
          : m.config_manager_file_missing()}
      </span>
    )
  }

  const incomplete =
    check.dataDisks === 0 ||
    check.parityLevels === 0 ||
    check.contentFiles === 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${incomplete ? 'font-medium text-orange-700' : 'text-gray-500'}`}
      title={incomplete ? m.config_manager_incomplete() : undefined}
    >
      {incomplete && <AlertTriangle size={14} />}
      {m.config_manager_summary({
        data: check.dataDisks,
        parity: check.parityLevels,
        content: check.contentFiles,
      })}
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
      className={`flex items-center justify-between gap-4 p-4 border rounded-lg transition-all ${config.enabled ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm' : 'bg-gray-50 border-gray-200'}`}
    >
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          checked={config.enabled}
          aria-checked={config.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={m.config_manager_toggle_label({ name: config.name })}
          title={
            config.enabled
              ? m.config_manager_enabled()
              : m.config_manager_disabled()
          }
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </label>

      <div className="flex-1 min-w-0">
        {renaming ? (
          <form
            className="flex items-center gap-1 mb-1"
            onSubmit={(e) => {
              e.preventDefault()
              submitRename()
            }}
          >
            <input
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
              className="min-w-0 flex-1 px-2 py-1 border border-gray-300 rounded font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              // biome-ignore lint/a11y/noAutofocus: the field replaces the name the user just chose to rename
              autoFocus
            />
            <Button
              type="submit"
              variant="ghost"
              size="iconSm"
              aria-label={m.common_save()}
              disabled={!name.trim()}
            >
              <Check size={16} />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={m.common_cancel()}
              onClick={cancelRename}
            >
              <X size={16} />
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-1 mb-1">
            <h4
              className={`font-semibold text-lg truncate ${config.enabled ? 'text-gray-900' : 'text-gray-500'}`}
            >
              {config.name}
            </h4>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => {
                setName(config.name)
                setRenaming(true)
              }}
              aria-label={m.config_manager_rename()}
              title={m.config_manager_rename()}
            >
              <Pencil size={14} />
            </Button>
          </div>
        )}
        <div className="text-sm text-gray-500 font-mono truncate">
          {config.path}
        </div>
        <div className="mt-1">
          <CheckSummary check={check} />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          onClick={onEdit}
          disabled={fileMissing}
          className="rounded-lg font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          <Pencil size={16} />
          {m.config_manager_edit()}
        </Button>
        <Button
          variant="ghostDanger"
          size="icon"
          onClick={onDelete}
          aria-label={m.config_manager_delete()}
          title={m.config_manager_delete()}
          className="rounded-lg"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  )
}
