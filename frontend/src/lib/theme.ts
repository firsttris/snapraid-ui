import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'snapraid-ui-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Runs in <head> before the first paint, so a dark page never flashes light.
 * Keep in sync with readPreference and resolve below.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}')}catch(e){}var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`

// Storage may be unavailable (private mode, blocked site data), the theme then follows the system
const readPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

const storePreference = (preference: ThemePreference) => {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Only a convenience
  }
}

const resolve = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'system'
    ? window.matchMedia(DARK_QUERY).matches
      ? 'dark'
      : 'light'
    : preference

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

/**
 * Theme preference of this browser; `system` follows the OS setting, also when it changes
 */
export const useTheme = () => {
  // SSR renders without a preference, the init script already set the right theme
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => setPreference(readPreference()), [])

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolve(preference)
    }
    apply()
    if (preference !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  const cycle = () => {
    const next = NEXT[preference]
    storePreference(next)
    setPreference(next)
  }

  return { preference, cycle }
}
