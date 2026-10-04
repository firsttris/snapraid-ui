import { Ban, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { ErrorAlert } from './ErrorAlert'
import { useFeedback } from './Feedback'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ExcludePatternSectionProps {
  exclude: string[]
  onAdd: (pattern: string) => Promise<void>
  onRemove: (pattern: string) => Promise<void>
}

export const ExcludePatternSection = ({
  exclude,
  onAdd,
  onRemove,
}: ExcludePatternSectionProps) => {
  const { confirm } = useFeedback()
  const [showAddExclude, setShowAddExclude] = useState(false)
  const [newExcludePattern, setNewExcludePattern] = useState('')
  const [addingExclude, setAddingExclude] = useState(false)
  const [error, setError] = useState('')

  const handleAddExclude = async () => {
    if (!newExcludePattern.trim()) {
      setError(m.exclude_pattern_pattern_required())
      return
    }

    setAddingExclude(true)
    setError('')
    try {
      await onAdd(newExcludePattern.trim())
      setNewExcludePattern('')
      setShowAddExclude(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingExclude(false)
    }
  }

  const handleRemoveExclude = async (pattern: string) => {
    const confirmed = await confirm({
      message: m.exclude_pattern_confirm_remove({ pattern }),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return

    setError('')
    try {
      await onRemove(pattern)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Ban className="size-4 text-muted-foreground" />
          {m.exclude_pattern_title()}
          <Badge variant="secondary" className="tabular-nums">
            {exclude.length}
          </Badge>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddExclude(!showAddExclude)}
        >
          <Plus />
          {m.exclude_pattern_add_pattern()}
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert error={error} />}

        {showAddExclude && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exclude-pattern" className="flex-wrap">
                {m.exclude_pattern_label()}
                <span className="text-xs font-normal text-muted-foreground">
                  ({m.exclude_pattern_hint()})
                </span>
              </Label>
              <Input
                id="exclude-pattern"
                value={newExcludePattern}
                onChange={(e) => setNewExcludePattern(e.target.value)}
                placeholder={m.exclude_pattern_pattern_placeholder()}
                className="bg-background font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddExclude}
                disabled={addingExclude}
              >
                {addingExclude ? m.common_adding() : m.common_add()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddExclude(false)
                  setNewExcludePattern('')
                  setError('')
                }}
              >
                {m.common_cancel()}
              </Button>
            </div>
          </div>
        )}

        {exclude.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.exclude_pattern_no_patterns()}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exclude.map((pattern, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: patterns are not guaranteed unique
                key={index}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 dark:bg-input/20"
              >
                <span className="min-w-0 flex-1 break-all font-mono text-sm">
                  {pattern}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghostDestructive"
                      size="icon-sm"
                      onClick={() => handleRemoveExclude(pattern)}
                      aria-label={m.common_remove()}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{m.common_remove()}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
