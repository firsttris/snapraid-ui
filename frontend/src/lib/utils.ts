import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes, later ones win (shadcn/ui helper)
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/**
 * Format bytes to a human-readable size, 1024-based like the file managers
 */
export const formatBytes = (bytes: number): string => {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

/**
 * Format ISO date string to localized date/time
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleString()
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/**
 * Format ISO date string relative to now, e.g. "3 days ago" or "in 2 hours"
 */
export const formatRelativeTime = (
  dateString: string,
  locale: string,
): string => {
  const diff = new Date(dateString).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return rtf.format(0, 'minute')
}

/**
 * Days elapsed since an ISO date string
 */
export const daysSince = (dateString: string): number =>
  (Date.now() - new Date(dateString).getTime()) / (24 * 60 * 60 * 1000)

/**
 * Format gigabytes, switching to TB above 1000 GB
 */
export const formatGB = (gb: number): string =>
  gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${gb.toFixed(1)} GB`

// A run or block older than this is flagged as overdue
export const SYNC_STALE_DAYS = 7
export const SCRUB_STALE_DAYS = 30
// The default plan (8 % of blocks per run) takes about three months to verify the
// whole array with weekly scrubs, so the oldest block gets more slack
export const SCRUB_OLDEST_STALE_DAYS = 120

// Each scrub verifies the oldest blocks first, a few percent per run, so recent
// successful scrubs work off old blocks bit by bit and those need no warning
export const scrubKeepingUp = (
  run: { timestamp: string; result: string } | null | undefined,
) =>
  !!run &&
  (run.result === 'ok' || run.result === 'warning') &&
  daysSince(run.timestamp) <= SCRUB_STALE_DAYS

/**
 * Tailwind classes for disk usage, shared so all views use the same thresholds
 */
export const usageBarColor = (percent: number) => {
  if (percent >= 95) return 'bg-red-500'
  if (percent >= 85) return 'bg-yellow-500'
  return 'bg-blue-500'
}

export const usageTextColor = (percent: number) => {
  if (percent >= 95) return 'text-red-600'
  if (percent >= 85) return 'text-yellow-600'
  return 'text-gray-900'
}

/**
 * Format a duration in milliseconds, e.g. "45 s" or "1 h 12 min"
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 1) return '< 1 s'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
}

/**
 * Local calendar day of an ISO date string, for grouping
 */
export const dayKey = (dateString: string): string =>
  new Date(dateString).toDateString()

/**
 * Heading of a day: "Today", "Yesterday" or the date
 */
export const formatDayHeading = (
  dateString: string,
  locale: string,
): string => {
  const date = new Date(dateString)
  const today = new Date()
  const days = Math.round(
    (new Date(today.toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      (24 * 60 * 60 * 1000),
  )
  if (days === 0 || days === 1) {
    const text = new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
    }).format(-days, 'day')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

/**
 * Time of day of an ISO date string, e.g. "14:05"
 */
export const formatTime = (dateString: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
