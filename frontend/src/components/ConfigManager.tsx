import type { SnapRaidConfig } from '@shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FolderOpen, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { queryKeys, useRemoveConfig, useUpdateConfig } from '../hooks/queries'
import { useDialogKeys } from '../hooks/useDialogKeys'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { ConfigAddForm } from './ConfigAddForm'
import { ConfigCreateForm } from './ConfigCreateForm'
import { ConfigEditor } from './ConfigEditor'
import { ConfigList } from './ConfigList'
import { errorMessage, useFeedback } from './Feedback'

interface ConfigManagerProps {
  config: SnapRaidConfig[]
  onClose: () => void
}

export const ConfigManager = ({ config, onClose }: ConfigManagerProps) => {
  const { confirm, toast } = useFeedback()
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<'add' | 'create' | null>(null)
  const [editingConfig, setEditingConfig] = useState<{
    path: string
    name: string
  } | null>(null)

  const removeConfigMutation = useRemoveConfig()
  const updateConfigMutation = useUpdateConfig()

  useDialogKeys(dialogRef, onClose)

  const onError = (err: unknown) => toast.error(errorMessage(err))

  const handleRemove = async (cfg: SnapRaidConfig) => {
    const confirmed = await confirm({
      title: m.config_manager_remove_title(),
      message: m.config_manager_remove_confirm({
        name: cfg.name,
        path: cfg.path,
      }),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return
    removeConfigMutation.mutate(cfg.path, { onError })
  }

  const closeEditor = () => {
    setEditingConfig(null)
    // Disks may have changed, refresh the summaries
    queryClient.invalidateQueries({ queryKey: queryKeys.configChecks })
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut, Escape closes too
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-manager-title"
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col outline-none"
      >
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-start gap-4">
          <div>
            <h2
              id="config-manager-title"
              className="text-2xl font-semibold text-gray-900"
            >
              {m.config_manager_title()}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {m.config_manager_subtitle()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={m.common_close()}
          >
            <X size={22} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {form === 'add' && (
            <ConfigAddForm
              onCancel={() => setForm(null)}
              onSuccess={() => setForm(null)}
            />
          )}
          {form === 'create' && (
            <ConfigCreateForm
              onCancel={() => setForm(null)}
              onSuccess={(path, name) => {
                setForm(null)
                setEditingConfig({ path, name })
              }}
            />
          )}
          {form === null && (
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm('add')}
                className="px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-600 hover:text-blue-600 font-medium flex items-center justify-center gap-2"
              >
                <FolderOpen size={20} />
                {m.config_manager_add_existing()}
              </button>
              <button
                type="button"
                onClick={() => setForm('create')}
                className="px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all text-gray-600 hover:text-green-700 font-medium flex items-center justify-center gap-2"
              >
                <FilePlus2 size={20} />
                {m.config_manager_create_new()}
              </button>
            </div>
          )}

          <ConfigList
            configs={config}
            onEdit={(cfg) =>
              setEditingConfig({ path: cfg.path, name: cfg.name })
            }
            onDelete={handleRemove}
            onRename={(cfg, name) =>
              updateConfigMutation.mutate({ path: cfg.path, name }, { onError })
            }
            onToggle={(cfg, enabled) =>
              updateConfigMutation.mutate(
                { path: cfg.path, enabled },
                { onError },
              )
            }
          />
        </div>
      </div>

      {editingConfig && (
        <ConfigEditor
          configPath={editingConfig.path}
          configName={editingConfig.name}
          onClose={closeEditor}
        />
      )}
    </div>
  )
}
