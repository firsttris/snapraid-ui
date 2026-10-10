import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'
import * as m from '../../paraglide/messages'

export const Sheet = (
  props: React.ComponentProps<typeof SheetPrimitive.Root>,
) => <SheetPrimitive.Root data-slot="sheet" {...props} />

export const SheetTrigger = (
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) => <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />

export const SheetClose = (
  props: React.ComponentProps<typeof SheetPrimitive.Close>,
) => <SheetPrimitive.Close data-slot="sheet-close" {...props} />

export const SheetContent = ({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
}) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <SheetPrimitive.Content
      data-slot="sheet-content"
      className={cn(
        'fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
        side === 'right' &&
          'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
        side === 'left' &&
          'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        side === 'top' &&
          'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        side === 'bottom' &&
          'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <XIcon className="size-4" />
        <span className="sr-only">{m.common_close()}</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
)

export const SheetHeader = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="sheet-header"
    className={cn('flex flex-col gap-1.5 p-4', className)}
    {...props}
  />
)

export const SheetTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) => (
  <SheetPrimitive.Title
    data-slot="sheet-title"
    className={cn('font-semibold text-foreground', className)}
    {...props}
  />
)

export const SheetDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) => (
  <SheetPrimitive.Description
    data-slot="sheet-description"
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
)

// The scrolling part between header and footer of a form in a sheet
export const SheetBody = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="sheet-body"
    className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)}
    {...props}
  />
)

export const SheetFooter = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="sheet-footer"
    className={cn(
      'flex flex-wrap items-center justify-end gap-3 border-t p-4',
      className,
    )}
    {...props}
  />
)
