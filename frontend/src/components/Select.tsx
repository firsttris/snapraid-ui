import { cn } from '@/lib/utils'
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from './ui/select'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  // Secondary text, e.g. the path of a config
  hint?: string
}

interface SelectProps<T extends string | number> {
  id?: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

// Radix only takes non-empty strings as item values
const EMPTY = '\u0000empty'
const toKey = (value: string | number) => (value === '' ? EMPTY : String(value))

/**
 * Styled select on top of Radix Select. Values may be strings or numbers,
 * they are converted to strings for Radix and back.
 */
export const Select = <T extends string | number>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  size = 'md',
  className,
}: SelectProps<T>) => {
  const selected = options.find((o) => o.value === value)

  return (
    <SelectRoot
      value={selected ? toKey(selected.value) : undefined}
      onValueChange={(key) => {
        const option = options.find((o) => toKey(o.value) === key)
        if (option && option.value !== value) onChange(option.value)
      }}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger
        id={id}
        size={size === 'sm' ? 'sm' : 'default'}
        className={cn('text-left', className)}
      >
        <SelectValue placeholder="—">
          {selected && (
            <span className="min-w-0 truncate">
              {selected.label}
              {selected.hint && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {selected.hint}
                </span>
              )}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={toKey(option.value)} value={toKey(option.value)}>
            <div className="flex min-w-0 flex-col">
              <SelectItemText>{option.label}</SelectItemText>
              {option.hint && (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {option.hint}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
