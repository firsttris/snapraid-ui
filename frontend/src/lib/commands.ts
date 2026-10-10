import type { SnapRaidCommand } from '@shared/types'
import {
  Activity,
  Clock,
  Copy,
  FileDiff,
  HardDrive,
  Layers,
  List,
  type LucideIcon,
  Radar,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Stethoscope,
  Terminal,
  Wrench,
} from 'lucide-react'
import * as m from '../paraglide/messages'

const COMMAND_ICONS: Record<SnapRaidCommand, LucideIcon> = {
  sync: RefreshCw,
  scrub: ShieldCheck,
  status: Activity,
  diff: FileDiff,
  check: SearchCheck,
  fix: Wrench,
  smart: Stethoscope,
  probe: Radar,
  devices: HardDrive,
  list: List,
  dup: Copy,
  touch: Clock,
  pool: Layers,
}

export const getCommandIcon = (command: SnapRaidCommand | string): LucideIcon =>
  COMMAND_ICONS[command as SnapRaidCommand] ?? Terminal

// Icon tile colors, the commands that change the array stand out
const COMMAND_TONES: Partial<Record<SnapRaidCommand, string>> = {
  sync: 'bg-blue-50 text-blue-600',
  scrub: 'bg-purple-50 text-purple-600',
  check: 'bg-indigo-50 text-indigo-600',
  fix: 'bg-orange-50 text-orange-600',
  diff: 'bg-cyan-50 text-cyan-600',
  smart: 'bg-emerald-50 text-emerald-600',
}

export const getCommandTone = (command: SnapRaidCommand | string): string =>
  COMMAND_TONES[command as SnapRaidCommand] ?? 'bg-gray-100 text-gray-600'

// Dots in timelines, the same hue as the icon tile
const COMMAND_DOTS: Partial<Record<SnapRaidCommand, string>> = {
  sync: 'bg-blue-500',
  scrub: 'bg-purple-500',
  check: 'bg-indigo-500',
  fix: 'bg-orange-500',
  diff: 'bg-cyan-500',
  smart: 'bg-emerald-500',
}

export const getCommandDot = (command: SnapRaidCommand | string): string =>
  COMMAND_DOTS[command as SnapRaidCommand] ?? 'bg-gray-400'

export const getCommandLabel = (command: SnapRaidCommand | string): string => {
  switch (command) {
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
    case 'smart':
      return m.commands_smart()
    default:
      return command
  }
}

export const getCommandDescription = (command: SnapRaidCommand): string => {
  switch (command) {
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
    case 'smart':
      return m.commands_desc_smart()
    default:
      return ''
  }
}
