import type { SnapRaidCommand } from '@shared/types'
import * as m from '../paraglide/messages'

interface CommandPanelProps {
  onExecute: (command: SnapRaidCommand) => void
  onUndelete: () => void
  disabled: boolean
  isRunning: boolean
  currentCommand: string
}

const getCommandLabel = (id: SnapRaidCommand) => {
  switch (id) {
    case 'status': return m.commands_status()
    case 'diff': return m.commands_diff()
    case 'sync': return m.commands_sync()
    case 'scrub': return m.commands_scrub()
    case 'fix': return m.commands_fix()
    case 'check': return m.commands_check()
    default: return id
  }
}

const COMMANDS: Array<{
  id: SnapRaidCommand
  color: string
}> = [
  { id: 'status', color: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'diff', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { id: 'sync', color: 'bg-green-600 hover:bg-green-700' },
  { id: 'scrub', color: 'bg-purple-600 hover:bg-purple-700' },
  { id: 'check', color: 'bg-yellow-600 hover:bg-yellow-700' },
]

export const CommandPanel = ({ onExecute, onUndelete, disabled, isRunning, currentCommand }: CommandPanelProps) => {
  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">{m.commands_title()}</h2>
      <div className="flex flex-wrap gap-3">
        {COMMANDS.map(({ id, color }) => (
          <button
            key={id}
            onClick={() => onExecute(id)}
            disabled={disabled || isRunning}
            className={`px-4 py-2 text-white rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${color}`}
          >
            {getCommandLabel(id)}
          </button>
        ))}
        <button
          onClick={onUndelete}
          disabled={disabled || isRunning}
          className="px-4 py-2 text-white rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed bg-orange-600 hover:bg-orange-700"
        >
          {m.commands_fix()}
        </button>
      </div>
      {isRunning && currentCommand && (
        <div className="mt-4 text-sm text-gray-600">
          {m.commands_running()}: <span className="font-medium">{currentCommand}</span>
          <span className="animate-pulse ml-2">...</span>
        </div>
      )}
    </div>
  )
}
