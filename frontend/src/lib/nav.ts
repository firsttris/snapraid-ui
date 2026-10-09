import {
  Activity,
  Bell,
  Calendar,
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

/**
 * Navigation entry of a path, for the page title in the header
 */
export const navItemOf = (pathname: string): NavItem | undefined =>
  NAV_ITEMS.find((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  )
