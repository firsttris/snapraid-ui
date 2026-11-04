import type * as React from 'react'
import { cn } from '@/lib/utils'

export const Kbd = ({ className, ...props }: React.ComponentProps<'kbd'>) => (
  <kbd
    data-slot="kbd"
    className={cn(
      'pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground',
      className,
    )}
    {...props}
  />
)
