import type { SnapRaidCommand } from '@shared/types'
import { MoreHorizontal } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { getCommandDescription, getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

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

export const CommandMenu = ({
  onSelect,
  disabled,
}: {
  onSelect: (command: SnapRaidCommand) => void
  disabled: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)

  // A job may start from elsewhere while the menu is open
  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="icon"
          title={m.commands_more()}
          aria-label={m.commands_more()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {MENU_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.title()}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel title={group.description()}>
                {group.title()}
              </DropdownMenuLabel>
              {group.commands.map((id) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => onSelect(id)}
                  className="flex-col items-start gap-0"
                >
                  <span className="font-medium">
                    {/* Opens the deleted files on the changes page */}
                    {id === 'fix' ? m.nav_recovery() : getCommandLabel(id)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getCommandDescription(id)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
