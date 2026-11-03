import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * `lift` lets the card rise on hover when animations are set to strong; only for a card that
 * is clickable as a whole, like the SMART disk cards
 */
export const Card = ({
  className,
  lift = false,
  ...props
}: React.ComponentProps<'div'> & { lift?: boolean }) => (
  <div
    data-slot="card"
    data-lift={lift || undefined}
    className={cn(
      'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
      className,
    )}
    {...props}
  />
)

export const CardHeader = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-header"
    className={cn(
      '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
      className,
    )}
    {...props}
  />
)

export const CardTitle = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-title"
    className={cn('font-semibold leading-none', className)}
    {...props}
  />
)

export const CardDescription = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-description"
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
)

export const CardAction = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-action"
    className={cn(
      'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
      className,
    )}
    {...props}
  />
)

export const CardContent = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div data-slot="card-content" className={cn('px-6', className)} {...props} />
)

export const CardFooter = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-footer"
    className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
    {...props}
  />
)
