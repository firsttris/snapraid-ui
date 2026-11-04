import type { SnapRaidCommand } from '@shared/types'
import { useNavigate } from '@tanstack/react-router'
import {
  ArchiveRestore,
  Check,
  Layers,
  Monitor,
  Moon,
  Settings2,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useConfig } from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import {
  getCommandDescription,
  getCommandIcon,
  getCommandLabel,
} from '../lib/commands'
import { ARRAY_NAV_ITEM, FILE_NAV_ITEMS, NAV_ITEMS } from '../lib/nav'
import { useMotion, useTheme } from '../lib/theme'
import * as m from '../paraglide/messages'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command'

// The commands the dashboard can run, in the order of daily use
const PALETTE_COMMANDS: SnapRaidCommand[] = ['sync', 'scrub', 'check', 'touch']

/**
 * Ctrl/Cmd+K: run SnapRAID commands, jump to pages, switch configs and settings
 */
export const CommandPalette = () => {
  const { paletteOpen, setPaletteOpen, requestCommand, openConfigDialog } =
    useAppShell()
  const navigate = useNavigate()
  const job = useJob()
  const { data: config } = useConfig()
  const { selectedConfig, setSelectedConfig } = useSelectedConfig()
  const theme = useTheme()
  const { motion, setMotion } = useMotion()

  const run = (action: () => void) => {
    setPaletteOpen(false)
    action()
  }

  const otherConfigs =
    config?.snapraidConfigs.filter(
      (c) => c.enabled && c.path !== selectedConfig,
    ) ?? []

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      title={m.palette_title()}
      description={m.palette_description()}
    >
      <CommandInput placeholder={m.palette_placeholder()} />
      <CommandList>
        <CommandEmpty>{m.palette_empty()}</CommandEmpty>
        <CommandGroup
          heading={
            job.isRunning
              ? `${m.palette_group_commands()} · ${m.palette_job_running()}`
              : m.palette_group_commands()
          }
        >
          {PALETTE_COMMANDS.map((command) => {
            const Icon = getCommandIcon(command)
            return (
              <CommandItem
                key={command}
                value={`${command} ${getCommandLabel(command)}`}
                disabled={job.isRunning || !selectedConfig}
                onSelect={() =>
                  run(() => {
                    requestCommand(command)
                    navigate({ to: '/' })
                  })
                }
              >
                <Icon />
                <span>{getCommandLabel(command)}</span>
                <span className="truncate text-muted-foreground">
                  {getCommandDescription(command)}
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={m.palette_group_navigation()}>
          {[...NAV_ITEMS, ...FILE_NAV_ITEMS, ARRAY_NAV_ITEM].map(
            ({ to, label, icon: Icon, keywords }) => (
              <CommandItem
                key={to}
                // status, diff, list, dup and fix have their own pages
                value={`nav ${label()} ${keywords?.() ?? ''}`}
                onSelect={() => run(() => navigate({ to }))}
              >
                <Icon />
                {label()}
              </CommandItem>
            ),
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={m.palette_group_configs()}>
          {otherConfigs.map((cfg) => (
            <CommandItem
              key={cfg.path}
              value={`config ${cfg.name} ${cfg.path}`}
              disabled={job.isRunning}
              onSelect={() => run(() => setSelectedConfig(cfg.path))}
            >
              <Settings2 />
              {m.palette_switch_config({ name: cfg.name })}
            </CommandItem>
          ))}
          <CommandItem
            value="config manage"
            onSelect={() => run(() => openConfigDialog('manager'))}
          >
            <Layers />
            {m.config_manager_title()}
          </CommandItem>
          <CommandItem
            value="backup"
            onSelect={() => run(() => openConfigDialog('backup'))}
          >
            <ArchiveRestore />
            {m.backup_title()}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={m.palette_group_settings()}>
          {(
            [
              ['light', Sun, m.theme_light],
              ['dark', Moon, m.theme_dark],
              ['system', Monitor, m.theme_system],
            ] as const
          ).map(([value, Icon, label]) => (
            <CommandItem
              key={value}
              value={`theme ${m.theme_label()} ${label()}`}
              onSelect={() => run(() => theme.setTheme(value))}
            >
              <Icon />
              {m.theme_label()}: {label()}
              {theme.preference === value && <Check className="ml-auto" />}
            </CommandItem>
          ))}
          {(
            [
              ['off', m.motion_off],
              ['subtle', m.motion_subtle],
              ['strong', m.motion_strong],
            ] as const
          ).map(([value, label]) => (
            <CommandItem
              key={value}
              value={`motion ${m.motion_label()} ${label()}`}
              onSelect={() => run(() => setMotion(value))}
            >
              <Sparkles />
              {m.motion_label()}: {label()}
              {motion === value && <Check className="ml-auto" />}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
