import type { SnapRaidCommand } from '@shared/types'
import { Search, TriangleAlert, X } from 'lucide-react'
import { getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'
import { Input } from './ui/input'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export type CommandFilter = SnapRaidCommand | 'all'

interface LogFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filterCommand: CommandFilter
  onFilterChange: (value: CommandFilter) => void
  problemsOnly: boolean
  onProblemsOnlyChange: (value: boolean) => void
  // Commands that have logs, with their number
  commandCounts: Array<[SnapRaidCommand, number]>
  totalCount: number
  problemCount: number
}

const PROBLEMS = 'problems'

const Count = ({ value }: { value: number }) => (
  <span className="text-xs text-muted-foreground tabular-nums">{value}</span>
)

export const LogFilters = ({
  searchTerm,
  onSearchChange,
  filterCommand,
  onFilterChange,
  problemsOnly,
  onProblemsOnlyChange,
  commandCounts,
  totalCount,
  problemCount,
}: LogFiltersProps) => {
  // One command at a time, the problems filter combines with it
  const value = [filterCommand, ...(problemsOnly ? [PROBLEMS] : [])]
  const handleChange = (next: string[]) => {
    const problems = next.includes(PROBLEMS)
    if (problems !== problemsOnly) {
      onProblemsOnlyChange(problems)
      return
    }
    const added = next.find(
      (entry) => entry !== PROBLEMS && entry !== filterCommand,
    )
    if (added) onFilterChange(added as CommandFilter)
    // Clicking the active command again shows all
    else if (!next.includes(filterCommand)) onFilterChange('all')
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={m.log_filters_search_placeholder()}
          aria-label={m.log_filters_search_placeholder()}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="px-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label={m.log_filters_clear_search()}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <ToggleGroup
        type="multiple"
        value={value}
        onValueChange={handleChange}
        className="flex w-full flex-wrap"
      >
        <ToggleGroupItem value="all" className="px-2.5">
          {m.log_filters_all()}
          <Count value={totalCount} />
        </ToggleGroupItem>
        {problemCount > 0 && (
          <ToggleGroupItem
            value={PROBLEMS}
            className="px-2.5 data-[state=on]:text-red-700"
          >
            <TriangleAlert className="size-3.5" />
            {m.log_filters_problems()}
            <Count value={problemCount} />
          </ToggleGroupItem>
        )}
        {commandCounts.map(([command, count]) => (
          <ToggleGroupItem key={command} value={command} className="px-2.5">
            {getCommandLabel(command)}
            <Count value={count} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
