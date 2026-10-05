import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type MotionPreference = 'off' | 'subtle' | 'strong'

const THEME_KEY = 'snapraid-ui-theme'
const MOTION_KEY = 'snapraid-ui-motion'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Runs in <head> before the first paint, so a dark page never flashes light
 * and animations don't start before the motion preference applies.
 * Keep in sync with the read and resolve functions below.
 */
export const THEME_INIT_SCRIPT = `(function(){var p,q;try{p=localStorage.getItem('${THEME_KEY}');q=localStorage.getItem('${MOTION_KEY}')}catch(e){}var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);var e=document.documentElement;e.dataset.theme=d?'dark':'light';e.dataset.motion=q==='off'||q==='subtle'||q==='strong'?q:window.matchMedia('${REDUCED_MOTION_QUERY}').matches?'off':'subtle'})()`

// Storage may be unavailable (private mode, blocked site data), the settings then follow the system
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Only a convenience
  }
}

const readTheme = (): ThemePreference => {
  const stored = read(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const readMotion = (): MotionPreference | null => {
  const stored = read(MOTION_KEY)
  return stored === 'off' || stored === 'subtle' || stored === 'strong'
    ? stored
    : null
}

const resolveTheme = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'system'
    ? window.matchMedia(DARK_QUERY).matches
      ? 'dark'
      : 'light'
    : preference

// Without an explicit choice, the system's "reduce motion" turns animations off
const resolveMotion = (preference: MotionPreference | null): MotionPreference =>
  preference ??
  (window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'off' : 'subtle')

interface Settings {
  theme: ThemePreference
  resolvedTheme: 'light' | 'dark'
  motion: MotionPreference
}

// SSR renders with the defaults, the init script already applied the stored settings
const SERVER_SETTINGS: Settings = {
  theme: 'system',
  resolvedTheme: 'light',
  motion: 'subtle',
}

let settings: Settings | null = null
const listeners = new Set<() => void>()

const apply = () => {
  if (!settings) return
  const root = document.documentElement
  root.dataset.theme = settings.resolvedTheme
  root.dataset.motion = settings.motion
}

const update = (next: Partial<Settings>) => {
  settings = { ...getSnapshot(), ...next }
  apply()
  for (const listener of listeners) listener()
}

const getSnapshot = (): Settings => {
  if (!settings) {
    const theme = readTheme()
    settings = {
      theme,
      resolvedTheme: resolveTheme(theme),
      motion: resolveMotion(readMotion()),
    }
  }
  return settings
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    // Follow the system while no explicit choice is stored
    const dark = window.matchMedia(DARK_QUERY)
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY)
    const onDark = () => {
      if (getSnapshot().theme === 'system')
        update({ resolvedTheme: resolveTheme('system') })
    }
    const onReduced = () => {
      if (!readMotion()) update({ motion: resolveMotion(null) })
    }
    dark.addEventListener('change', onDark)
    reduced.addEventListener('change', onReduced)
    cleanup = () => {
      dark.removeEventListener('change', onDark)
      reduced.removeEventListener('change', onReduced)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) cleanup?.()
  }
}

let cleanup: (() => void) | undefined

const useSettings = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SETTINGS)

/**
 * Theme preference of this browser; `system` follows the OS setting, also when it changes
 */
export const useTheme = () => {
  const { theme, resolvedTheme } = useSettings()
  const setTheme = (preference: ThemePreference) => {
    write(THEME_KEY, preference === 'system' ? null : preference)
    update({ theme: preference, resolvedTheme: resolveTheme(preference) })
  }
  return { preference: theme, resolved: resolvedTheme, setTheme }
}

/**
 * How strong animations are: off, subtle (default) or strong
 */
export const useMotion = () => {
  const { motion } = useSettings()
  const setMotion = (preference: MotionPreference) => {
    write(MOTION_KEY, preference)
    update({ motion: preference })
  }
  return { motion, setMotion }
}
