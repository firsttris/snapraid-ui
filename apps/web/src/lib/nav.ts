import {
  Activity,
  BadgeCheck,
  Bell,
  Calendar,
  Copy,
  FileCog,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import * as m from '../paraglide/messages'

export interface NavItem {
  to:
    | '/'
    | '/integrity'
    | '/changes'
    | '/files'
    | '/duplicates'
    | '/smart'
    | '/schedules'
    | '/logs'
    | '/notifications'
    | '/automation'
    | '/array'
  label: () => string
  icon: LucideIcon
  keywords?: () => string // Also found by these in the command palette
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: m.nav_dashboard, icon: LayoutDashboard },
  {
    to: '/integrity',
    label: m.nav_integrity,
    icon: BadgeCheck,
    keywords: () => `status scrub ${m.status_modal_scrub_age()}`,
  },
  { to: '/smart', label: m.nav_smart, icon: Activity },
  { to: '/schedules', label: m.schedules, icon: Calendar },
  { to: '/logs', label: m.logs, icon: FileText },
  { to: '/notifications', label: m.nav_notifications, icon: Bell },
  { to: '/automation', label: m.nav_automation, icon: Workflow },
]

// What is on the disks of the selected array, in the sidebar's Files group
export const FILE_NAV_ITEMS: NavItem[] = [
  {
    to: '/changes',
    label: m.nav_changes,
    icon: History,
    keywords: () => `diff fix undelete ${m.nav_recovery()}`,
  },
  {
    to: '/files',
    label: m.nav_files,
    icon: ShieldCheck,
    keywords: () => 'list',
  },
  {
    to: '/duplicates',
    label: m.nav_duplicates,
    icon: Copy,
    keywords: () => 'dup',
  },
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
  [...NAV_ITEMS, ...FILE_NAV_ITEMS, ARRAY_NAV_ITEM].find((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  )
