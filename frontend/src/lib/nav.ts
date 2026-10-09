import {
  Activity,
  Bell,
  Calendar,
  FileCog,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
  Workflow,
} from 'lucide-react'
import * as m from '../paraglide/messages'

export interface NavItem {
  to:
    | '/'
    | '/recovery'
    | '/smart'
    | '/schedules'
    | '/logs'
    | '/notifications'
    | '/automation'
    | '/array'
  label: () => string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: m.nav_dashboard, icon: LayoutDashboard },
  { to: '/recovery', label: m.nav_recovery, icon: History },
  { to: '/smart', label: m.nav_smart, icon: Activity },
  { to: '/schedules', label: m.schedules, icon: Calendar },
  { to: '/logs', label: m.logs, icon: FileText },
  { to: '/notifications', label: m.nav_notifications, icon: Bell },
  { to: '/automation', label: m.nav_automation, icon: Workflow },
]

// The selected array's snapraid.conf, in the sidebar's Array group
export const ARRAY_NAV_ITEM: NavItem = {
  to: '/array',
  label: m.nav_array,
  icon: FileCog,
}

/**
 * Navigation entry of a path, for the page title in the header
 */
export const navItemOf = (pathname: string): NavItem | undefined =>
  [...NAV_ITEMS, ARRAY_NAV_ITEM].find((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  )
