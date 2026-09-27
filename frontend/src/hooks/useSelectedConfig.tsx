import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useConfig } from './queries'

const STORAGE_KEY = 'snapraid-ui:selected-config'

interface SelectedConfigContextValue {
  selectedConfig: string
  setSelectedConfig: (path: string) => void
  // Select the config whose file matches a path the backend reports (it resolves paths)
  selectConfigByFile: (path: string) => void
}

const SelectedConfigContext = createContext<SelectedConfigContextValue | null>(
  null,
)

const fileName = (path: string) => path.replace(/^.*[/\\]/, '')

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const writeStored = (path: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, path)
  } catch {
    // Storage unavailable (private mode, blocked site data), selection just isn't remembered
  }
}

export const SelectedConfigProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const { data: config } = useConfig()
  const [selectedConfig, setSelected] = useState('')

  const enabledConfigs = useMemo(
    () => config?.snapraidConfigs.filter((c) => c.enabled) ?? [],
    [config],
  )

  // Restore the remembered config, or fall back to the first enabled one
  useEffect(() => {
    if (!config) return
    if (selectedConfig && enabledConfigs.some((c) => c.path === selectedConfig))
      return

    const stored = readStored()
    const next =
      enabledConfigs.find((c) => c.path === stored) ?? enabledConfigs[0]
    setSelected(next?.path ?? '')
  }, [config, enabledConfigs, selectedConfig])

  const setSelectedConfig = useCallback((path: string) => {
    setSelected(path)
    if (path) writeStored(path)
  }, [])

  const selectConfigByFile = useCallback(
    (path: string) => {
      const match = enabledConfigs.find(
        (c) => fileName(c.path) === fileName(path),
      )
      if (match) setSelected(match.path)
    },
    [enabledConfigs],
  )

  const value = useMemo(
    () => ({ selectedConfig, setSelectedConfig, selectConfigByFile }),
    [selectedConfig, setSelectedConfig, selectConfigByFile],
  )

  return (
    <SelectedConfigContext.Provider value={value}>
      {children}
    </SelectedConfigContext.Provider>
  )
}

export const useSelectedConfig = (): SelectedConfigContextValue => {
  const context = useContext(SelectedConfigContext)
  if (!context)
    throw new Error(
      'useSelectedConfig must be used within SelectedConfigProvider',
    )
  return context
}
