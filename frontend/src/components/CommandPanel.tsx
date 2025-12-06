import type { SnapRaidCommand } from '@shared/types'

interface CommandPanelProps {
  onExecute: (command: SnapRaidCommand) => void
  disabled: boolean
  isRunning: boolean
  currentCommand: string
}

const COMMANDS: Array<{
  id: SnapRaidCommand
  label: string
  color: string
}> = [
  { id: 'status', label: 'Status', color: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'diff', label: 'Diff', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'sync', label: 'Sync', color: 'bg-green-600 hover:bg-green-700' },
  { id: 'scrub', label: 'Scrub', color: 'bg-purple-600 hover:bg-purple-700' },
]

export function CommandPanel({ onExecute, disabled, isRunning, currentCommand }: CommandPanelProps) {
  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Commands</h2>
      <div className="flex flex-wrap gap-3">
        {COMMANDS.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => onExecute(id)}
            disabled={disabled || isRunning}
            className={`px-4 py-2 text-white rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${color}`}
          >
            {label}
          </button>
        ))}
      </div>
      {isRunning && currentCommand && (
        <div className="mt-4 text-sm text-gray-600">
          Running: <span className="font-medium">{currentCommand}</span>
          <span className="animate-pulse ml-2">...</span>
        </div>
      )}
    </div>
  )
}
