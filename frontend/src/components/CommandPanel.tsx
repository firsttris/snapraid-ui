import type { SnapRaidCommand } from '@shared/types'
import { ChevronDown, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { JobResult } from '../hooks/useWebSocketConnection'
import type { JobProgress } from '../lib/progress'
import * as m from '../paraglide/messages'

interface CommandPanelProps {
  onExecute: (command: SnapRaidCommand) => void
  onUndelete: () => void
  onAbort: () => void
  onShowCheckReport: () => void
  disabled: boolean
  isRunning: boolean
  isAborting: boolean
  currentCommand: string
  progress: JobProgress | null
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
    case 'dup':
      return m.commands_dup()
    case 'touch':
      return m.commands_touch()
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
    case 'dup':
      return m.commands_desc_dup()
    case 'touch':
      return m.commands_desc_touch()
    default:
      return ''
  }
}

// Sync and scrub are the everyday commands, everything else lives in the menu
const PRIMARY_COMMANDS: SnapRaidCommand[] = ['scrub', 'sync']

const MENU_GROUPS: Array<{
  title: () => string
  description: () => string
  commands: SnapRaidCommand[]
}> = [
  {
    title: m.commands_group_info,
    description: m.commands_group_info_desc,
    commands: ['status', 'diff', 'list', 'dup', 'devices'],
  },
  {
    title: m.commands_group_maintenance,
    description: m.commands_group_maintenance_desc,
    commands: ['check', 'touch', 'pool'],
  },
  {
    title: m.commands_group_recovery,
    description: m.commands_group_recovery_desc,
    commands: ['fix'],
  },
]

const getMenuItems = (menu: HTMLElement | null) =>
  Array.from(
    menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
  )

const CommandMenu = ({
  onSelect,
  disabled,
}: {
  onSelect: (command: SnapRaidCommand) => void
  disabled: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    getMenuItems(menuRef.current)[0]?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  // A job may start from elsewhere while the menu is open
  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  const close = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const items = getMenuItems(menuRef.current)
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    switch (event.key) {
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        items[(index + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        event.preventDefault()
        items[(index - 1 + items.length) % items.length]?.focus()
        break
      case 'Home':
        event.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        items[items.length - 1]?.focus()
        break
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {m.commands_more()}
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleKeyDown}
          className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {MENU_GROUPS.map((group, groupIndex) => (
            <div
              key={group.title()}
              className={
                groupIndex > 0 ? 'mt-1 border-t border-gray-100 pt-1' : ''
              }
            >
              <div
                className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
                title={group.description()}
              >
                {group.title()}
              </div>
              {group.commands.map((id) => (
                <button
                  type="button"
                  role="menuitem"
                  key={id}
                  tabIndex={-1}
                  onClick={() => {
                    setIsOpen(false)
                    onSelect(id)
                  }}
                  className={`block w-full px-3 py-1.5 text-left outline-none ${
                    id === 'fix'
                      ? 'text-red-700 hover:bg-red-50 focus:bg-red-50'
                      : 'hover:bg-blue-50 focus:bg-blue-50'
                  }`}
                >
                  <span className="block text-sm font-medium">
                    {getCommandLabel(id)}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {getCommandDescription(id)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const formatEta = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

const ProgressBar = ({ progress }: { progress: JobProgress }) => (
  <div className="w-full">
    <div className="h-2 overflow-hidden rounded-full bg-blue-100">
      <div
        className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
        style={{ width: `${Math.min(progress.percent, 100)}%` }}
      />
    </div>
    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-blue-900">
      <span className="font-semibold">{progress.percent}%</span>
      <span>{m.progress_processed({ size: progress.processedMB })}</span>
      {progress.speedMBs !== undefined && (
        <span>{m.progress_speed({ speed: progress.speedMBs })}</span>
      )}
      {progress.etaMinutes !== undefined && (
        <span>{m.progress_eta({ eta: formatEta(progress.etaMinutes) })}</span>
      )}
    </div>
  </div>
)

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
  onShowCheckReport,
  disabled,
  isRunning,
  isAborting,
  currentCommand,
  progress,
  lastResult,
  onDismissResult,
}: CommandPanelProps) => {
  const banner = !isRunning && lastResult ? getResultBanner(lastResult) : null
  const runCommand = (id: SnapRaidCommand) =>
    id === 'fix' ? onUndelete() : onExecute(id)

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{m.commands_title()}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PRIMARY_COMMANDS.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => runCommand(id)}
              disabled={disabled || isRunning}
              title={getCommandDescription(id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                id === 'sync'
                  ? 'border-green-600 bg-green-600 text-white hover:bg-green-700'
                  : 'border-gray-300 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {getCommandLabel(id)}
            </button>
          ))}
          <CommandMenu onSelect={runCommand} disabled={disabled || isRunning} />
        </div>
      </div>

      {isRunning && currentCommand && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
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
          {progress && !isAborting && <ProgressBar progress={progress} />}
        </div>
      )}

      {banner && (
        <div
          className={`mt-4 flex items-start justify-between gap-3 rounded-lg border p-4 text-sm ${banner.className}`}
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {banner.text}
            {lastResult?.command === 'check' && !lastResult.aborted && (
              <button
                type="button"
                onClick={onShowCheckReport}
                className="font-medium underline hover:no-underline"
              >
                {m.check_show_report()}
              </button>
            )}
          </span>
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
    </div>
  )
}
