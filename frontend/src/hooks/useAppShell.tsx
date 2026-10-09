import type { SnapRaidCommand } from '@shared/types'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { BackupDialog } from '../components/BackupDialog'
import { ConfigManager } from '../components/ConfigManager'
import { useConfig } from './queries'

const SIDEBAR_KEY = 'snapraid-ui-sidebar'

interface AppShellContextValue {
  sidebarOpen: boolean
  toggleSidebar: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  openConfigDialog: (dialog: 'manager' | 'backup') => void
  // A command picked in the palette, run by the dashboard once it is mounted
  pendingCommand: SnapRaidCommand | null
  requestCommand: (command: SnapRaidCommand) => void
  clearPendingCommand: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

/**
 * Whether the sidebar sits next to the page (from Tailwind lg, as in AppSidebar);
 * below that, on phones and tablets, it opens as a sheet
 */
export const isSidebarDocked = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(min-width: 1024px)').matches

/**
 * State of the app frame: sidebar, command palette and the dialogs for arrays and backup,
 * which the sidebar and the pages open alike
 */
export const AppShellProvider = ({ children }: { children: ReactNode }) => {
  const { data: config } = useConfig()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [configDialog, setConfigDialog] = useState<'manager' | 'backup' | null>(
    null,
  )
  const [pendingCommand, setPendingCommand] = useState<SnapRaidCommand | null>(
    null,
  )

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === 'closed') setSidebarOpen(false)
    } catch {
      // Storage unavailable, the sidebar starts open
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? 'closed' : 'open')
      } catch {
        // Only a convenience
      }
      return !open
    })
  }, [])

  // Ctrl/Cmd+K opens the palette, Ctrl/Cmd+B toggles the sidebar
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (key === 'b') {
        event.preventDefault()
        if (isSidebarDocked()) toggleSidebar()
        else setMobileNavOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const value = useMemo<AppShellContextValue>(
    () => ({
      sidebarOpen,
      toggleSidebar,
      mobileNavOpen,
      setMobileNavOpen,
      paletteOpen,
      setPaletteOpen,
      openConfigDialog: setConfigDialog,
      pendingCommand,
      requestCommand: setPendingCommand,
      clearPendingCommand: () => setPendingCommand(null),
    }),
    [sidebarOpen, toggleSidebar, mobileNavOpen, paletteOpen, pendingCommand],
  )

  return (
    <AppShellContext.Provider value={value}>
      {children}
      {configDialog === 'manager' && config && (
        <ConfigManager
          config={config.snapraidConfigs}
          onClose={() => setConfigDialog(null)}
        />
      )}
      {configDialog === 'backup' && (
        <BackupDialog onClose={() => setConfigDialog(null)} />
      )}
    </AppShellContext.Provider>
  )
}

export const useAppShell = (): AppShellContextValue => {
  const context = useContext(AppShellContext)
  if (!context)
    throw new Error('useAppShell must be used within AppShellProvider')
  return context
}
