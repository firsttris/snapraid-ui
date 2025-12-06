import type { SnapRaidCommand } from '@shared/types'

interface LogFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filterCommand: SnapRaidCommand | 'all'
  onFilterChange: (value: SnapRaidCommand | 'all') => void
}

export function LogFilters({ searchTerm, onSearchChange, filterCommand, onFilterChange }: LogFiltersProps) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search logs..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      
      <div className="flex gap-2 flex-wrap">
        {(['all', 'status', 'sync', 'scrub', 'diff'] as const).map(cmd => (
          <button
            key={cmd}
            onClick={() => onFilterChange(cmd)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
              filterCommand === cmd
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cmd === 'all' ? 'All' : cmd}
          </button>
        ))}
      </div>
    </div>
  )
}
