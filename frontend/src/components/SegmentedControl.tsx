import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

// Switches between views or modes, unlike Button it shows which one is active
export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) => (
  <ToggleGroup
    type="single"
    value={value}
    onValueChange={(next) => {
      if (next) onChange(next as T)
    }}
    className="max-w-full flex-wrap"
  >
    {options.map((option) => (
      <ToggleGroupItem key={option.value} value={option.value} className="px-4">
        {option.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
)
