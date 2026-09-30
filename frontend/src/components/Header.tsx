import { Link } from '@tanstack/react-router'
import {
  Activity,
  Calendar,
  FileText,
  HardDrive,
  Languages,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useCurrentJob } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { getLocale, setLocale } from '../paraglide/runtime'

// The dashboard learns about jobs over the WebSocket, other pages only need a coarse indicator
const JOB_POLL_INTERVAL_MS = 5000

const NAV_ITEMS = [
  { to: '/', label: m.nav_dashboard, icon: LayoutDashboard },
  { to: '/smart', label: m.nav_smart, icon: Activity },
  { to: '/schedules', label: m.schedules, icon: Calendar },
  { to: '/logs', label: m.logs, icon: FileText },
] as const

export const Header = () => {
  const [isOpen, setIsOpen] = useState(false)
  const currentLocale = getLocale()
  const { data: currentJob } = useCurrentJob({
    refetchInterval: JOB_POLL_INTERVAL_MS,
  })

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
    <header className="bg-gray-800 text-white shadow-lg">
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
            onClick={toggleLocale}
            className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-gray-700"
            aria-label="Switch language"
          >
            <Languages size={18} />
            <span className="text-sm font-medium">
              {currentLocale.toUpperCase()}
            </span>
          </button>
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
