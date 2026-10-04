import type { ParityLevel } from '@shared/types'
import { FolderOpen, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDiskReplacement } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { ErrorAlert } from './ErrorAlert'
import { useFeedback } from './Feedback'
import { ReplaceDiskWizard } from './ReplaceDiskWizard'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ParityDiskSectionProps {
  configPath: string
  parity: ParityLevel[]
  onAdd: (fullPath: string) => Promise<void>
  onRemove: (level: number) => Promise<void>
}

const MAX_PARITY_LEVEL = 6

export const ParityDiskSection = ({
  configPath,
  parity,
  onAdd,
  onRemove,
}: ParityDiskSectionProps) => {
  const { confirm } = useFeedback()
  const [showAddParity, setShowAddParity] = useState(false)
  const [newParityPath, setNewParityPath] = useState('')
  const [newParityFilename, setNewParityFilename] = useState('snapraid.parity')
  const [addingParity, setAddingParity] = useState(false)
  const [showParityBrowser, setShowParityBrowser] = useState(false)
  const [error, setError] = useState('')
  const [replacing, setReplacing] = useState<ParityLevel | null>(null)
  const { data: replacement } = useDiskReplacement(configPath)
  const replacingDisk =
    replacement && !replacement.completedAt ? replacement.diskName : null

  // Levels must stay without gaps, so only the highest one can be removed
  const highestLevel = Math.max(0, ...parity.map((p) => p.level))
  const nextKeyword =
    highestLevel === 0 ? 'parity' : `${highestLevel + 1}-parity`
  const canAdd = highestLevel < MAX_PARITY_LEVEL

  const handleAddParity = async () => {
    if (!newParityPath.trim()) {
      setError(m.parity_disk_directory_required())
      return
    }

    if (!newParityFilename.trim()) {
      setError(m.parity_disk_filename_required())
      return
    }

    if (!newParityFilename.endsWith('.parity')) {
      setError(m.parity_disk_filename_must_end_parity())
      return
    }

    const fullPath = `${newParityPath}/${newParityFilename}`

    setAddingParity(true)
    setError('')
    try {
      await onAdd(fullPath)
      setNewParityPath('')
      setNewParityFilename('snapraid.parity')
      setShowAddParity(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingParity(false)
    }
  }

  const handleRemove = async (level: number) => {
    const confirmed = await confirm({
      message: m.parity_disk_confirm_remove(),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return

    setError('')
    try {
      await onRemove(level)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {m.parity_disk_title()}
          <Badge variant="secondary" className="tabular-nums">
            {parity.length}
          </Badge>
        </h3>
        {canAdd ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddParity(!showAddParity)}
          >
            <Plus />
            {m.parity_disk_add_parity()}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button variant="outline" size="sm" disabled>
                  <Plus />
                  {m.parity_disk_add_parity()}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{m.parity_disk_max_reached()}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert error={error} />}

        {showAddParity && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              {m.parity_disk_next_level({ keyword: nextKeyword })}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="parity-disk-path">
                {m.parity_disk_directory_label()}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="parity-disk-path"
                  value={newParityPath}
                  onChange={(e) => setNewParityPath(e.target.value)}
                  placeholder={m.parity_disk_directory_placeholder()}
                  className="bg-background font-mono"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowParityBrowser(true)}
                      aria-label={m.parity_disk_browse()}
                    >
                      <FolderOpen />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{m.parity_disk_browse()}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="parity-disk-filename">
                {m.parity_disk_filename_label()}
                <span className="text-xs font-normal text-muted-foreground">
                  ({m.parity_disk_filename_label_tooltip()})
                </span>
              </Label>
              <Input
                id="parity-disk-filename"
                value={newParityFilename}
                onChange={(e) => setNewParityFilename(e.target.value)}
                placeholder={m.parity_disk_filename_placeholder()}
                className="bg-background font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddParity}
                disabled={addingParity}
              >
                {addingParity ? m.common_adding() : m.common_add()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddParity(false)
                  setNewParityPath('')
                  setNewParityFilename('snapraid.parity')
                  setError('')
                }}
              >
                {m.common_cancel()}
              </Button>
            </div>
          </div>
        )}

        {parity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.parity_disk_no_disks()}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {parity.map((p) => {
              const isReplacing = replacingDisk === p.keyword
              const removable = p.level === highestLevel
              return (
                <li
                  key={p.keyword}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background px-3 py-2 dark:bg-input/20"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="parity" className="font-mono">
                        {p.keyword}
                      </Badge>
                      {p.paths.length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {m.parity_disk_split({ count: p.paths.length })}
                        </span>
                      )}
                      {isReplacing && (
                        <Badge variant="info">{m.replace_disk_badge()}</Badge>
                      )}
                    </div>
                    {p.paths.map((path) => (
                      <div
                        key={path}
                        className="truncate font-mono text-sm"
                        title={path}
                      >
                        {path}
                      </div>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReplacing(p)}
                      title={m.replace_disk_button_title()}
                    >
                      {isReplacing
                        ? m.replace_disk_resume()
                        : m.replace_disk_button()}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="ghostDestructive"
                            size="icon-sm"
                            aria-label={m.common_remove()}
                            onClick={() => handleRemove(p.level)}
                            disabled={!removable || isReplacing}
                          >
                            <Trash2 />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {removable
                          ? m.common_remove()
                          : m.parity_disk_remove_highest_only()}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {replacing && (
        <ReplaceDiskWizard
          configPath={configPath}
          diskName={replacing.keyword}
          diskType="parity"
          currentPath={replacing.paths.join(',')}
          onClose={() => setReplacing(null)}
        />
      )}

      {showParityBrowser && (
        <DirectoryBrowser
          title={m.parity_disk_select_directory()}
          currentValue={newParityPath}
          onSelect={(path) => {
            setNewParityPath(path)
            setShowParityBrowser(false)
          }}
          onClose={() => setShowParityBrowser(false)}
        />
      )}
    </section>
  )
}
