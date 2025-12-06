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
