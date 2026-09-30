/**
 * Placeholder in the shape of content that is still loading
 */
export const Skeleton = ({ className = '' }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={`block animate-pulse rounded bg-gray-200 ${className}`}
  />
)

/**
 * Small spinner with a text, for a section that is fetching its data
 */
export const LoadingHint = ({ children }: { children: string }) => (
  <span
    role="status"
    className="inline-flex items-center gap-2 text-sm text-gray-500"
  >
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
    {children}
  </span>
)
