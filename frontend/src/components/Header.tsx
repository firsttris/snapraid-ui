import { Link } from '@tanstack/react-router'
import {
  Activity,
  Bell,
  Calendar,
  FileText,
  HardDrive,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useCurrentJob, useLogout, useSession } from '../hooks/queries'
import { useTheme } from '../lib/theme'
import * as m from '../paraglide/messages'
import { getLocale, setLocale } from '../paraglide/runtime'

// The dashboard learns about jobs over the WebSocket, other pages only need a coarse indicator
const JOB_POLL_INTERVAL_MS = 5000

const NAV_ITEMS = [
  { to: '/', label: m.nav_dashboard, icon: LayoutDashboard },
  { to: '/smart', label: m.nav_smart, icon: Activity },
  { to: '/schedules', label: m.schedules, icon: Calendar },
  { to: '/logs', label: m.logs, icon: FileText },
  { to: '/notifications', label: m.nav_notifications, icon: Bell },
] as const

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

const THEME_LABELS = {
  light: m.theme_light,
  dark: m.theme_dark,
  system: m.theme_system,
} as const

export const Header = () => {
  const [isOpen, setIsOpen] = useState(false)
  const theme = useTheme()
  const ThemeIcon = THEME_ICONS[theme.preference]
  const currentLocale = getLocale()
  const { data: currentJob } = useCurrentJob({
    refetchInterval: JOB_POLL_INTERVAL_MS,
  })
  const { data: session } = useSession()
  const logout = useLogout()

  const toggleLocale = () => {
    setLocale(currentLocale === 'en' ? 'de' : 'en')
  }

  const linkClass =
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors'
  const activeLinkClass =
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-gray-900 text-white'

  const links = NAV_ITEMS.map(({ to, label, icon: Icon }) => (
    <Link
      key={to}
      to={to}
      onClick={() => setIsOpen(false)}
      className={linkClass}
      activeProps={{ className: activeLinkClass }}
      activeOptions={{ exact: to === '/' }}
    >
      <Icon size={16} />
      {label()}
    </Link>
  ))

  return (
    <header className="theme-fixed bg-gray-800 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <HardDrive size={22} className="text-cyan-400" />
          <span className="text-lg">{m.app_title()}</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">{links}</nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {currentJob && (
            <Link
              to="/"
              className="flex items-center gap-2 rounded-full bg-cyan-600 px-3 py-1 text-xs font-medium hover:bg-cyan-700"
              title={m.nav_job_running({ command: currentJob.command })}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="hidden sm:inline">
                {m.nav_job_running({ command: currentJob.command })}
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={theme.cycle}
            className="rounded-lg p-2 transition-colors hover:bg-gray-700"
            title={m.theme_switch({ theme: THEME_LABELS[theme.preference]() })}
            aria-label={m.theme_switch({
              theme: THEME_LABELS[theme.preference](),
            })}
          >
            <ThemeIcon size={18} />
          </button>
          <button
            type="button"
            onClick={toggleLocale}
            className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-gray-700"
            aria-label="Switch language"
          >
            <Languages size={18} />
            <span className="text-sm font-medium">
              {currentLocale.toUpperCase()}
            </span>
          </button>
          {session?.enabled && (
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-gray-700 disabled:opacity-50"
              title={
                session.username
                  ? m.nav_signed_in_as({ username: session.username })
                  : undefined
              }
              aria-label={m.nav_logout()}
            >
              <LogOut size={18} />
              <span className="hidden text-sm font-medium lg:inline">
                {m.nav_logout()}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded-lg p-2 transition-colors hover:bg-gray-700 md:hidden"
            aria-label={m.navigation()}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <nav className="flex flex-col gap-1 border-t border-gray-700 px-4 py-3 md:hidden">
          {links}
        </nav>
      )}
    </header>
  )
}
