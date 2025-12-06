/**
 * Format bytes to human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format ISO date string to localized date/time
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}
