import type { SnapRaidConfig } from '@shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { queryKeys, useRemoveConfig, useUpdateConfig } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { BackupSection } from './BackupSection'
import { ConfigAddForm } from './ConfigAddForm'
import { ConfigCreateForm } from './ConfigCreateForm'
import { ConfigEditor } from './ConfigEditor'
import { ConfigList } from './ConfigList'
import { errorMessage, useFeedback } from './Feedback'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface ConfigManagerProps {
  config: SnapRaidConfig[]
  onClose: () => void
}

export const ConfigManager = ({ config, onClose }: ConfigManagerProps) => {
  const { confirm, toast } = useFeedback()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<'add' | 'create' | null>(null)
  const [editingConfig, setEditingConfig] = useState<{
    path: string
    name: string
  } | null>(null)

  const removeConfigMutation = useRemoveConfig()
  const updateConfigMutation = useUpdateConfig()

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
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl"
          onEscapeKeyDown={(event) => {
            // Escape in an inline field (rename) only leaves that field
            if (
              event.target instanceof Element &&
              event.target.closest('[data-escape-local]')
            ) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle>{m.config_manager_title()}</DialogTitle>
            <DialogDescription>{m.config_manager_subtitle()}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => setForm('add')}
                  className="h-auto border-dashed py-3 text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen />
                  {m.config_manager_add_existing()}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setForm('create')}
                  className="h-auto border-dashed py-3 text-muted-foreground hover:text-foreground"
                >
                  <FilePlus2 />
                  {m.config_manager_create_new()}
                </Button>
              </div>
            )}

            <ConfigList
              configs={config}
              onEdit={(cfg) =>
                setEditingConfig({ path: cfg.path, name: cfg.name })
              }
              onDelete={handleRemove}
              onRename={(cfg, name) =>
                updateConfigMutation.mutate(
                  { path: cfg.path, name },
                  { onError },
                )
              }
              onToggle={(cfg, enabled) =>
                updateConfigMutation.mutate(
                  { path: cfg.path, enabled },
                  { onError },
                )
              }
            />

            <BackupSection />
          </div>
        </DialogContent>
      </Dialog>

      {editingConfig && (
        <ConfigEditor
          configPath={editingConfig.path}
          configName={editingConfig.name}
          onClose={closeEditor}
        />
      )}
    </>
  )
}
