import type { SnapRaidCommand } from '@shared/types'
import { Square } from 'lucide-react'
import type { JobResult } from '../hooks/useWebSocketConnection'
import * as m from '../paraglide/messages'

interface CommandPanelProps {
  onExecute: (command: SnapRaidCommand) => void
  onUndelete: () => void
  onAbort: () => void
  disabled: boolean
  isRunning: boolean
  isAborting: boolean
  currentCommand: string
  lastResult: JobResult | null
  onDismissResult: () => void
}

const getCommandLabel = (id: SnapRaidCommand) => {
  switch (id) {
    case 'status':
      return m.commands_status()
    case 'diff':
      return m.commands_diff()
    case 'sync':
      return m.commands_sync()
    case 'scrub':
      return m.commands_scrub()
    case 'fix':
      return m.commands_fix()
    case 'check':
      return m.commands_check()
    case 'pool':
      return m.commands_pool()
    case 'devices':
      return m.commands_devices()
    case 'list':
      return m.commands_list()
    default:
      return id
  }
}

const getCommandDescription = (id: SnapRaidCommand) => {
  switch (id) {
    case 'status':
      return m.commands_desc_status()
    case 'diff':
      return m.commands_desc_diff()
    case 'sync':
      return m.commands_desc_sync()
    case 'scrub':
      return m.commands_desc_scrub()
    case 'fix':
      return m.commands_desc_fix()
    case 'check':
      return m.commands_desc_check()
    case 'pool':
      return m.commands_desc_pool()
    case 'devices':
      return m.commands_desc_devices()
    case 'list':
      return m.commands_desc_list()
    default:
      return ''
  }
}

const COMMAND_GROUPS: Array<{
  title: () => string
  description: () => string
  commands: SnapRaidCommand[]
}> = [
  {
    title: m.commands_group_info,
    description: m.commands_group_info_desc,
    commands: ['status', 'diff', 'list', 'devices'],
  },
  {
    title: m.commands_group_maintenance,
    description: m.commands_group_maintenance_desc,
    commands: ['sync', 'scrub', 'check', 'pool'],
  },
  {
    title: m.commands_group_recovery,
    description: m.commands_group_recovery_desc,
    commands: ['fix'],
  },
]

const getResultBanner = (
  result: JobResult,
): { className: string; text: string } => {
  const command = getCommandLabel(result.command as SnapRaidCommand)
  if (result.error) {
    return {
      className: 'bg-red-50 border-red-200 text-red-800',
      text: `❌ ${m.commands_result_error({ command, error: result.error })}`,
    }
  }
  if (result.aborted) {
    return {
      className: 'bg-gray-50 border-gray-200 text-gray-700',
      text: `⏹ ${m.commands_result_aborted({ command })}`,
    }
  }
  if (result.exitCode === 0) {
    return {
      className: 'bg-green-50 border-green-200 text-green-800',
      text: `✅ ${m.commands_result_ok({ command })}`,
    }
  }
  return {
    className: 'bg-red-50 border-red-200 text-red-800',
    text: `❌ ${m.commands_result_failed({ command, code: String(result.exitCode) })}`,
  }
}

export const CommandPanel = ({
  onExecute,
  onUndelete,
  onAbort,
  disabled,
  isRunning,
  isAborting,
  currentCommand,
  lastResult,
  onDismissResult,
}: CommandPanelProps) => {
  const banner = !isRunning && lastResult ? getResultBanner(lastResult) : null

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">{m.commands_title()}</h2>

      {isRunning && currentCommand && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3 text-sm text-blue-900">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
            {isAborting ? (
              m.commands_aborting()
            ) : (
              <span>
                {m.commands_running()}:{' '}
                <span className="font-semibold">
                  {getCommandLabel(currentCommand as SnapRaidCommand)}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onAbort}
            disabled={isAborting}
            className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Square size={14} fill="currentColor" />
            {m.commands_abort()}
          </button>
        </div>
      )}

      {banner && (
        <div
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-4 text-sm ${banner.className}`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={onDismissResult}
            className="opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {COMMAND_GROUPS.map((group) => (
          <div key={group.title()}>
            <h3 className="text-sm font-semibold text-gray-800">
              {group.title()}
            </h3>
            <p className="mb-2 text-xs text-gray-500">{group.description()}</p>
            <div className="space-y-2">
              {group.commands.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => (id === 'fix' ? onUndelete() : onExecute(id))}
                  disabled={disabled || isRunning}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    id === 'sync'
                      ? 'border-green-600 bg-green-600 text-white hover:bg-green-700'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <span className="block font-medium">
                    {getCommandLabel(id)}
                  </span>
                  <span
                    className={`block text-xs ${id === 'sync' ? 'text-green-50' : 'text-gray-500'}`}
                  >
                    {getCommandDescription(id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
