import { FolderOpen, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { useFeedback } from './Feedback'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface PoolSectionProps {
  pool?: string
  onPoolChange: (pool: string | undefined) => void
}

export const PoolSection = ({ pool, onPoolChange }: PoolSectionProps) => {
  const { confirm, toast } = useFeedback()
  const [showBrowser, setShowBrowser] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [localPool, setLocalPool] = useState(pool || '')

  const handleAdd = () => {
    if (!localPool.trim()) {
      toast.error(m.pool_directory_required())
      return
    }
    onPoolChange(localPool.trim())
    setEditMode(false)
  }

  const handleRemove = async () => {
    const confirmed = await confirm({
      message: m.pool_confirm_remove(),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return
    onPoolChange(undefined)
    setLocalPool('')
    setEditMode(false)
  }

  const handleBrowserSelect = (path: string) => {
    setLocalPool(path)
    setShowBrowser(false)
  }

  return (
    <>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FolderTree className="size-4 text-muted-foreground" />
            {m.pool_section_title()}
          </h3>
          {!editMode && !pool && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
            >
              <Plus />
              {m.common_add()}
            </Button>
          )}
        </div>

        <div className="p-4">
          {!pool && !editMode ? (
            <p className="text-sm text-muted-foreground">
              {m.pool_no_pool_configured()}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pool-directory">
                  {m.pool_directory_label()}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="pool-directory"
                    value={editMode ? localPool : pool}
                    onChange={(e) => editMode && setLocalPool(e.target.value)}
                    placeholder={m.pool_directory_placeholder()}
                    disabled={!editMode}
                    className="font-mono"
                  />
                  {editMode && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setShowBrowser(true)}
                          aria-label={m.pool_directory_browse()}
                        >
                          <FolderOpen />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {m.pool_directory_browse()}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.pool_directory_help()}
                </p>
              </div>

              {editMode ? (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditMode(false)
                      setLocalPool(pool || '')
                    }}
                  >
                    {m.common_cancel()}
                  </Button>
                  <Button size="sm" onClick={handleAdd}>
                    {m.common_save()}
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLocalPool(pool || '')
                      setEditMode(true)
                    }}
                  >
                    <Pencil />
                    {m.common_edit()}
                  </Button>
                  <Button
                    variant="ghostDestructive"
                    size="sm"
                    onClick={handleRemove}
                  >
                    <Trash2 />
                    {m.common_remove()}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={localPool || '/'}
          title={m.pool_select_directory()}
        />
      )}
    </>
  )
}
