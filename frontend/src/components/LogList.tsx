import type { SnapRaidCommand } from '@shared/types'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeleteLog, useLogs, useRotateLogs } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { errorMessage, useFeedback } from './Feedback'
import { LogFilters } from './LogFilters'
import { LogListItem } from './LogListItem'

interface LogListProps {
  selectedLog: string | null
  onSelectLog: (filename: string | null) => void
}

export const LogList = ({ selectedLog, onSelectLog }: LogListProps) => {
  const { confirm, toast } = useFeedback()
  const [filterCommand, setFilterCommand] = useState<SnapRaidCommand | 'all'>(
    'all',
  )
  const [searchTerm, setSearchTerm] = useState('')

  const { data: logs = [], isLoading, refetch } = useLogs()
  const deleteLogMutation = useDeleteLog()
  const rotateLogsMutation = useRotateLogs()

  const handleDeleteLog = async (filename: string) => {
    const confirmed = await confirm({
      message: m.logs_delete_confirm({ filename }),
      confirmLabel: m.confirm_delete(),
      danger: true,
    })
    if (!confirmed) return

    deleteLogMutation.mutate(filename, {
      onSuccess: () => {
        if (selectedLog === filename) {
          onSelectLog(null)
        }
      },
      onError: (error) => {
        toast.error(m.logs_delete_failed({ error: errorMessage(error) }))
      },
    })
  }

  const handleRotateLogs = () => {
    rotateLogsMutation.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(m.logs_rotated({ count: result.deleted }))
      },
      onError: (error) => {
        toast.error(m.logs_rotate_failed({ error: errorMessage(error) }))
      },
    })
  }

  const filteredLogs = logs.filter((log) => {
    const matchesCommand =
      filterCommand === 'all' || log.command === filterCommand
    const matchesSearch = log.filename
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
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
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw size={14} />
              {m.log_list_refresh()}
            </Button>
            <Button
              variant="ghostDanger"
              size="sm"
              onClick={handleRotateLogs}
              disabled={rotateLogsMutation.isPending}
            >
              <Trash2 size={14} />
              {m.log_list_clean_old()}
            </Button>
          </div>
        </div>

        <LogFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterCommand={filterCommand}
          onFilterChange={setFilterCommand}
        />
      </div>

      <div className="overflow-auto max-h-[calc(100vh-300px)]">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">
            {m.log_list_loading()}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            {m.log_list_no_logs()}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredLogs.map((log) => (
              <LogListItem
                key={log.filename}
                log={log}
                isSelected={selectedLog === log.filename}
                onSelect={onSelectLog}
                onDelete={handleDeleteLog}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
