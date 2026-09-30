/**
 * Format bytes to human-readable file size
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
