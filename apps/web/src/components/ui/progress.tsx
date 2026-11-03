import { Progress as ProgressPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export const Progress = ({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}) => (
  <ProgressPrimitive.Root
    data-slot="progress"
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-muted',
      className,
    )}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(
        'h-full w-full flex-1 rounded-full bg-primary transition-all',
        indicatorClassName,
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
)
