import { cn } from '../lib/utils'

/**
 * Placeholder in the shape of content that is still loading
 */
export const Skeleton = ({ className = '' }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cn('ui-shimmer block rounded-md bg-muted', className)}
  />
)

/**
 * Small spinner with a text, for a section that is fetching its data
 */
export const LoadingHint = ({ children }: { children: string }) => (
  <span
    role="status"
    className="inline-flex items-center gap-2 text-sm text-muted-foreground"
  >
    <span className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    {children}
  </span>
)
