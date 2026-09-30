import type { SnapRaidCommand } from '@shared/types'
import { Search, TriangleAlert, X } from 'lucide-react'
import { getCommandIcon, getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'

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

const chipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
  }`

const countClass = (active: boolean) =>
  `tabular-nums ${active ? 'text-white/70' : 'text-gray-400'}`

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
}: LogFiltersProps) => (
  <div className="space-y-3">
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
      />
      <input
        type="search"
        placeholder={m.log_filters_search_placeholder()}
        aria-label={m.log_filters_search_placeholder()}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-9 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {searchTerm && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          aria-label={m.log_filters_clear_search()}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={14} />
        </button>
      )}
    </div>

    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={filterCommand === 'all'}
        onClick={() => onFilterChange('all')}
        className={chipClass(filterCommand === 'all')}
      >
        {m.log_filters_all()}
        <span className={countClass(filterCommand === 'all')}>
          {totalCount}
        </span>
      </button>
      {commandCounts.map(([command, count]) => {
        const Icon = getCommandIcon(command)
        const active = filterCommand === command
        return (
          <button
            type="button"
            key={command}
            aria-pressed={active}
            onClick={() => onFilterChange(active ? 'all' : command)}
            className={chipClass(active)}
          >
            <Icon size={12} />
            {getCommandLabel(command)}
            <span className={countClass(active)}>{count}</span>
          </button>
        )
      })}
      {problemCount > 0 && (
        <button
          type="button"
          aria-pressed={problemsOnly}
          onClick={() => onProblemsOnlyChange(!problemsOnly)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            problemsOnly
              ? 'border-red-600 bg-red-600 text-white'
              : 'border-red-200 bg-red-50 text-red-700 hover:border-red-300'
          }`}
        >
          <TriangleAlert size={12} />
          {m.log_filters_problems()}
          <span
            className={`tabular-nums ${problemsOnly ? 'text-white/70' : 'text-red-400'}`}
          >
            {problemCount}
          </span>
        </button>
      )}
    </div>
  </div>
)
