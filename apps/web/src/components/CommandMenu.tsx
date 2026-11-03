import type { SnapRaidCommand } from '@shared/types'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCommandDescription, getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

// The rarer maintenance next to the Scrub and Sync buttons; what only shows something has
// its own page. Pool only with a pool directory in the config.
const maintenanceCommands = (hasPool: boolean): SnapRaidCommand[] =>
  hasPool ? ['check', 'touch', 'pool'] : ['check', 'touch']

export const CommandMenu = ({
  onSelect,
  disabled,
  hasPool,
}: {
  onSelect: (command: SnapRaidCommand) => void
  disabled: boolean
  hasPool: boolean
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
        <DropdownMenuGroup>
          <DropdownMenuLabel title={m.commands_group_maintenance_desc()}>
            {m.commands_group_maintenance()}
          </DropdownMenuLabel>
          {maintenanceCommands(hasPool).map((id) => (
            <DropdownMenuItem
              key={id}
              onSelect={() => onSelect(id)}
              className="flex-col items-start gap-0"
            >
              <span className="font-medium">{getCommandLabel(id)}</span>
              <span className="text-xs text-muted-foreground">
                {getCommandDescription(id)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
