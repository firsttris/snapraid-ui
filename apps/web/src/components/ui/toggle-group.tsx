import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Segmented control: one of a few options, the active one raised
 */
export const ToggleGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) => (
  <ToggleGroupPrimitive.Root
    data-slot="toggle-group"
    className={cn(
      'inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export const ToggleGroupItem = ({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) => (
  <ToggleGroupPrimitive.Item
    data-slot="toggle-group-item"
    className={cn(
      "inline-flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none transition-[color,box-shadow,background-color] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/50 [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  />
)
