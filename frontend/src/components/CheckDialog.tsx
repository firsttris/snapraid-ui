import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'

type CheckMode = 'full' | 'audit'

interface CheckDialogProps {
  dataDisks: string[]
  onClose: () => void
  onConfirm: (args: string[]) => void
}

export const checkArgs = (mode: CheckMode, disks: string[], all: boolean) => [
  ...(mode === 'audit' ? ['-a'] : []),
  // No -d checks every disk
  ...(all ? [] : disks.flatMap((disk) => ['-d', disk])),
]

const MODES: Array<{
  id: CheckMode
  label: () => string
  description: () => string
}> = [
  {
    id: 'audit',
    label: m.check_mode_audit,
    description: m.check_mode_audit_desc,
  },
  { id: 'full', label: m.check_mode_full, description: m.check_mode_full_desc },
]

export const CheckDialog = ({
  dataDisks,
  onClose,
  onConfirm,
}: CheckDialogProps) => {
  const [mode, setMode] = useState<CheckMode>('audit')
  const [selected, setSelected] = useState<string[]>(dataDisks)

  const all = selected.length === dataDisks.length
  const args = checkArgs(mode, selected, all)

  const toggle = (disk: string) =>
    setSelected((current) =>
      current.includes(disk)
        ? current.filter((d) => d !== disk)
        : dataDisks.filter((d) => d === disk || current.includes(d)),
    )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-6 pr-12 pb-4">
          <DialogTitle>{m.check_dialog_title()}</DialogTitle>
          <DialogDescription>{m.check_dialog_intro()}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-2">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as CheckMode)}
            className="gap-2"
          >
            {MODES.map(({ id, label, description }) => (
              <label
                key={id}
                htmlFor={`check-mode-${id}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition-colors',
                  mode === id
                    ? 'border-primary ring-1 ring-primary'
                    : 'hover:bg-muted/50',
                )}
              >
                <RadioGroupItem
                  id={`check-mode-${id}`}
                  value={id}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{label()}</span>
                  <span className="block text-sm text-muted-foreground">
                    {description()}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <div className="space-y-2">
            <p className="text-sm font-medium">{m.check_dialog_disks()}</p>
            <div className="flex flex-wrap gap-2">
              {dataDisks.map((disk) => {
                const checked = selected.includes(disk)
                return (
                  <label
                    key={disk}
                    htmlFor={`check-disk-${disk}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm transition-colors',
                      checked
                        ? 'border-primary bg-muted'
                        : 'text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      id={`check-disk-${disk}`}
                      checked={checked}
                      onCheckedChange={() => toggle(disk)}
                    />
                    {disk}
                  </label>
                )
              })}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {m.check_dialog_job_hint()}
          </p>

          <p className="break-all rounded-md bg-muted px-2.5 py-2 font-mono text-xs text-muted-foreground">
            snapraid check {args.join(' ')}
          </p>
        </div>

        <DialogFooter className="p-6 pt-4">
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            onClick={() => onConfirm(args)}
            disabled={selected.length === 0}
          >
            {m.check_dialog_start()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
