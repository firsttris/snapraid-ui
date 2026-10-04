import { Database, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDiskReplacement } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { ErrorAlert } from './ErrorAlert'
import { RemoveDataDiskWizard } from './RemoveDataDiskWizard'
import { ReplaceDiskWizard } from './ReplaceDiskWizard'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface DataDiskSectionProps {
  configPath: string
  data: Record<string, string>
  pendingRemoval: string[]
  onAdd: (name: string, path: string) => Promise<void>
}

export const DataDiskSection = ({
  configPath,
  data,
  pendingRemoval,
  onAdd,
}: DataDiskSectionProps) => {
  // Captured on open, the wizard outlives the disk disappearing from the list
  const [removing, setRemoving] = useState<{
    name: string
    path: string
    pending: boolean
  } | null>(null)
  const [replacing, setReplacing] = useState<{
    name: string
    path: string
  } | null>(null)
  const { data: replacement } = useDiskReplacement(configPath)
  const replacingDisk =
    replacement && !replacement.completedAt ? replacement.diskName : null
  const [showAddDataDisk, setShowAddDataDisk] = useState(false)
  const [newDataDiskName, setNewDataDiskName] = useState('')
  const [newDataDiskPath, setNewDataDiskPath] = useState('')
  const [addingDataDisk, setAddingDataDisk] = useState(false)
  const [showDataDiskBrowser, setShowDataDiskBrowser] = useState(false)
  const [error, setError] = useState('')

  const handleAddDataDisk = async () => {
    if (!newDataDiskName.trim() || !newDataDiskPath.trim()) {
      setError(m.data_disk_name_and_path_required())
      return
    }

    setAddingDataDisk(true)
    setError('')
    try {
      await onAdd(newDataDiskName.trim(), newDataDiskPath.trim())
      setNewDataDiskName('')
      setNewDataDiskPath('')
      setShowAddDataDisk(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingDataDisk(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Database className="size-4 text-muted-foreground" />
          {m.data_disk_title()}
          <Badge variant="secondary" className="tabular-nums">
            {Object.keys(data).length}
          </Badge>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDataDisk(!showAddDataDisk)}
        >
          <Plus />
          {m.data_disk_add_disk()}
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert error={error} />}

        {showAddDataDisk && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data-disk-name">
                  {m.data_disk_name_label()}
                </Label>
                <Input
                  id="data-disk-name"
                  value={newDataDiskName}
                  onChange={(e) => setNewDataDiskName(e.target.value)}
                  placeholder={m.data_disk_name_placeholder()}
                  className="bg-background font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data-disk-path">
                  {m.data_disk_path_label()}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="data-disk-path"
                    value={newDataDiskPath}
                    onChange={(e) => setNewDataDiskPath(e.target.value)}
                    placeholder={m.data_disk_path_placeholder()}
                    className="bg-background font-mono"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowDataDiskBrowser(true)}
                        aria-label={m.data_disk_browse()}
                      >
                        <FolderOpen />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{m.data_disk_browse()}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddDataDisk}
                disabled={addingDataDisk}
              >
                {addingDataDisk ? m.common_adding() : m.common_add()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddDataDisk(false)
                  setNewDataDiskName('')
                  setNewDataDiskPath('')
                  setError('')
                }}
              >
                {m.common_cancel()}
              </Button>
            </div>
          </div>
        )}

        {Object.keys(data).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.data_disk_no_disks()}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {Object.entries(data).map(([name, path]) => {
              const pending = pendingRemoval.includes(name)
              const isReplacing = replacingDisk === name
              return (
                <li
                  key={name}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background px-3 py-2 dark:bg-input/20"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge variant="info" className="font-mono">
                      {name}
                    </Badge>
                    <span
                      className="min-w-0 truncate font-mono text-sm"
                      title={path}
                    >
                      {path}
                    </span>
                    {pending && (
                      <Badge variant="warning">
                        {m.data_disk_pending_removal()}
                      </Badge>
                    )}
                    {isReplacing && (
                      <Badge variant="info">{m.replace_disk_badge()}</Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!pending && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReplacing({ name, path })}
                        title={m.replace_disk_button_title()}
                      >
                        {isReplacing
                          ? m.replace_disk_resume()
                          : m.replace_disk_button()}
                      </Button>
                    )}
                    {pending ? (
                      <Button
                        variant="ghostDestructive"
                        size="sm"
                        onClick={() => setRemoving({ name, path, pending })}
                        disabled={isReplacing}
                      >
                        {m.data_disk_resume_removal()}
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              variant="ghostDestructive"
                              size="icon-sm"
                              onClick={() =>
                                setRemoving({ name, path, pending })
                              }
                              disabled={isReplacing}
                              aria-label={m.common_remove()}
                            >
                              <Trash2 />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{m.common_remove()}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {removing && (
        <RemoveDataDiskWizard
          configPath={configPath}
          diskName={removing.name}
          diskPath={removing.path}
          pending={removing.pending}
          onClose={() => setRemoving(null)}
        />
      )}

      {replacing && (
        <ReplaceDiskWizard
          configPath={configPath}
          diskName={replacing.name}
          diskType="data"
          currentPath={replacing.path}
          onClose={() => setReplacing(null)}
        />
      )}

      {showDataDiskBrowser && (
        <DirectoryBrowser
          title={m.data_disk_select_directory()}
          currentValue={newDataDiskPath}
          onSelect={(path) => {
            setNewDataDiskPath(path)
            setShowDataDiskBrowser(false)
          }}
          onClose={() => setShowDataDiskBrowser(false)}
        />
      )}
    </section>
  )
}
