import type { LogFile, SnapRaidCommand } from '@shared/types'
import { LogFilters } from './LogFilters'
import { LogListItem } from './LogListItem'
import * as m from '../paraglide/messages'

interface LogListProps {
  logs: LogFile[]
  isLoading: boolean
  selectedLog: string | null
  searchTerm: string
  onSearchChange: (value: string) => void
  filterCommand: SnapRaidCommand | 'all'
  onFilterChange: (value: SnapRaidCommand | 'all') => void
  onSelectLog: (filename: string) => void
  onDeleteLog: (filename: string) => void
  onRefresh: () => void
  onRotate: () => void
}

export const LogList = ({
  logs,
  isLoading,
  selectedLog,
  searchTerm,
  onSearchChange,
  filterCommand,
  onFilterChange,
  onSelectLog,
  onDeleteLog,
  onRefresh,
  onRotate,
}: LogListProps) => {
  const filteredLogs = logs.filter(log => {
    const matchesCommand = filterCommand === 'all' || log.command === filterCommand
    const matchesSearch = log.filename.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCommand && matchesSearch
  })

  return (
    <div className="bg-white shadow-lg rounded-xl border border-gray-100">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {m.log_list_title()} ({filteredLogs.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium"
            >
              {m.log_list_refresh()}
            </button>
            <button
              onClick={onRotate}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium"
            >
              {m.log_list_clean_old()}
            </button>
          </div>
        </div>

        <LogFilters
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          filterCommand={filterCommand}
          onFilterChange={onFilterChange}
        />
      </div>

      <div className="overflow-auto max-h-[calc(100vh-300px)]">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">{m.log_list_loading()}</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">{m.log_list_no_logs()}</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredLogs.map(log => (
              <LogListItem
                key={log.filename}
                log={log}
                isSelected={selectedLog === log.filename}
                onSelect={onSelectLog}
                onDelete={onDeleteLog}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
