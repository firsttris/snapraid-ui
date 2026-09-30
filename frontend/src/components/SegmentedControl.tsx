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
  <div className="inline-flex rounded-lg bg-gray-100 p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          value === option.value
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
)
