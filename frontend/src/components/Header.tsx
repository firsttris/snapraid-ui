import { Link } from '@tanstack/react-router'

import { useState } from 'react'
import {
  Home,
  Menu,
  FileText,
  X,
  Languages,
  Calendar,
} from 'lucide-react'
import * as m from '../paraglide/messages'
import { getLocale, setLocale } from '../paraglide/runtime'

export const Header = () => {
  const [isOpen, setIsOpen] = useState(false)
  const currentLocale = getLocale()

  const toggleLocale = () => {
    const newLocale = currentLocale === 'en' ? 'de' : 'en'
    setLocale(newLocale)
    window.location.reload()
  }

  return (
    <>
      <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="ml-4 text-xl font-semibold">
          <Link to="/">
            <img
              src="/tanstack-word-logo-white.svg"
              alt="TanStack Logo"
              className="h-10"
            />
          </Link>
        </h1>
        <button
          onClick={toggleLocale}
          className="ml-auto p-2 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
          aria-label="Switch language"
        >
          <Languages size={20} />
          <span className="text-sm font-medium">{currentLocale.toUpperCase()}</span>
        </button>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">{m.navigation()}</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">{m.home()}</span>
          </Link>

          <Link
            to="/logs"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <FileText size={20} />
            <span className="font-medium">{m.logs()}</span>
          </Link>

          <Link
            to="/schedules"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Calendar size={20} />
            <span className="font-medium">{m.schedules()}</span>
          </Link>
        </nav>
      </aside>
    </>
  )
}
