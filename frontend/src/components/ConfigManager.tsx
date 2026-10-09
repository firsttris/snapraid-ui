import type { SnapRaidConfig } from '@shared/types'
import { useNavigate } from '@tanstack/react-router'
import { FolderOpen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useRemoveConfig, useUpdateConfig } from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import * as m from '../paraglide/messages'
import { ConfigAddForm } from './ConfigAddForm'
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
  const navigate = useNavigate()
  const job = useJob()
  const { setSelectedConfig } = useSelectedConfig()
  const [adding, setAdding] = useState(false)

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

  // The array's page; it becomes the selected one unless it is hidden or a job runs
  const handleEdit = (cfg: SnapRaidConfig) => {
    onClose()
    if (cfg.enabled && !job.isRunning) {
      setSelectedConfig(cfg.path)
      navigate({ to: '/array' })
    } else {
      navigate({ to: '/array', search: { config: cfg.path } })
    }
  }

  const startWizard = () => {
    onClose()
    navigate({ to: '/setup', search: { start: 'new' } })
  }

  return (
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
          {adding ? (
            <ConfigAddForm
              onCancel={() => setAdding(false)}
              onSuccess={() => setAdding(false)}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => setAdding(true)}
                className="h-auto border-dashed py-3 text-muted-foreground hover:text-foreground"
              >
                <FolderOpen />
                {m.config_manager_add_existing()}
              </Button>
              <Button
                variant="outline"
                onClick={startWizard}
                className="h-auto border-dashed py-3 text-muted-foreground hover:text-foreground"
              >
                <Sparkles />
                {m.setup_new_button()}
              </Button>
            </div>
          )}

          <ConfigList
            configs={config}
            onEdit={handleEdit}
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
      </DialogContent>
    </Dialog>
  )
}
