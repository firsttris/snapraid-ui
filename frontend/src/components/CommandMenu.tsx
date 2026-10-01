import type { SnapRaidCommand } from '@shared/types'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getCommandDescription, getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'

// Everything besides status, sync and scrub, which have their own buttons
const MENU_GROUPS: Array<{
  title: () => string
  description: () => string
  commands: SnapRaidCommand[]
}> = [
  {
    title: m.commands_group_info,
    description: m.commands_group_info_desc,
    commands: ['diff', 'list', 'dup', 'devices'],
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

export const CommandMenu = ({
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
        title={m.commands_more()}
        aria-label={m.commands_more()}
        className="flex items-center gap-1 rounded border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal size={18} />
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
