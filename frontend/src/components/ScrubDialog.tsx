import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import {
  DEFAULT_SCRUB_OPTIONS,
  isValidScrubOptions,
  type ScrubOptions,
  ScrubPlanPicker,
  scrubArgs,
} from './ScrubPlanPicker'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface ScrubDialogProps {
  badBlocks: number
  onClose: () => void
  onConfirm: (args: string[]) => void
}

export const ScrubDialog = ({
  badBlocks,
  onClose,
  onConfirm,
}: ScrubDialogProps) => {
  const [options, setOptions] = useState<ScrubOptions>({
    ...DEFAULT_SCRUB_OPTIONS,
    plan: badBlocks > 0 ? 'bad' : 'default',
  })

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
          <DialogTitle>{m.scrub_dialog_title()}</DialogTitle>
          <DialogDescription>{m.scrub_dialog_intro()}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2">
          {badBlocks > 0 && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                {m.scrub_bad_blocks_hint({ count: badBlocks })}
              </AlertDescription>
            </Alert>
          )}

          <ScrubPlanPicker value={options} onChange={setOptions} />

          <p className="break-all rounded-md bg-muted px-2.5 py-2 font-mono text-xs text-muted-foreground">
            snapraid scrub {scrubArgs(options).join(' ')}
          </p>
        </div>

        <DialogFooter className="p-6 pt-4">
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            onClick={() => onConfirm(scrubArgs(options))}
            disabled={!isValidScrubOptions(options)}
          >
            {m.scrub_dialog_start()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
