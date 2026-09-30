import type { SnapRaidCommand } from '@shared/types'
import * as m from '../paraglide/messages'

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
    default:
      return ''
  }
}
