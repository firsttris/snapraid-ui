import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'

type UndeleteMode = 'all-missing' | 'directory-missing' | 'specific'

interface UndeleteModeSelectProps {
  mode: UndeleteMode
  onChange: (mode: UndeleteMode) => void
}

const MODES: Array<{ id: UndeleteMode; label: () => string; command: string }> =
  [
    {
      id: 'all-missing',
      label: m.undelete_all_missing,
      command: 'snapraid fix -m',
    },
    {
      id: 'directory-missing',
      label: m.undelete_directory_missing,
      command: 'snapraid fix -m -f DIR/',
    },
    {
      id: 'specific',
      label: m.undelete_specific_file,
      command: 'snapraid fix -f FILE',
    },
  ]

export const UndeleteModeSelector = ({
  mode,
  onChange,
}: UndeleteModeSelectProps) => (
  <div className="space-y-2">
    <p id="undelete-mode-label" className="text-sm font-medium">
      {m.undelete_mode_label()}
    </p>
    <RadioGroup
      value={mode}
      onValueChange={(value) => onChange(value as UndeleteMode)}
      aria-labelledby="undelete-mode-label"
      className="gap-2"
    >
      {MODES.map(({ id, label, command }) => (
        <label
          key={id}
          htmlFor={`undelete-mode-${id}`}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition-colors',
            mode === id
              ? 'border-primary ring-1 ring-primary'
              : 'hover:bg-muted/50',
          )}
        >
          <RadioGroupItem
            id={`undelete-mode-${id}`}
            value={id}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium">{label()}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {command}
            </span>
          </span>
        </label>
      ))}
    </RadioGroup>
  </div>
)
