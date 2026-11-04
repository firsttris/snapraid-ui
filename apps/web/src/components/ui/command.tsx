import { Command as CommandPrimitive } from 'cmdk'
import { SearchIcon } from 'lucide-react'
import type * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export const Command = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) => (
  <CommandPrimitive
    data-slot="command"
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
)

export const CommandDialog = ({
  title,
  description,
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title: string
  description: string
}) => (
  <Dialog {...props}>
    <DialogContent
      className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">{description}</DialogDescription>
      <Command className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
        {children}
      </Command>
    </DialogContent>
  </Dialog>
)

export const CommandInput = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) => (
  <div
    data-slot="command-input-wrapper"
    className="flex h-9 items-center gap-2 border-b px-3"
  >
    <SearchIcon className="size-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      data-slot="command-input"
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
)

export const CommandList = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List
    data-slot="command-list"
    className={cn(
      'max-h-[min(60vh,400px)] scroll-py-1 overflow-y-auto overflow-x-hidden',
      className,
    )}
    {...props}
  />
)

export const CommandEmpty = (
  props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) => (
  <CommandPrimitive.Empty
    data-slot="command-empty"
    className="py-6 text-center text-sm"
    {...props}
  />
)

export const CommandGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group
    data-slot="command-group"
    className={cn(
      'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export const CommandSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) => (
  <CommandPrimitive.Separator
    data-slot="command-separator"
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
)

export const CommandItem = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    data-slot="command-item"
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
)

export const CommandShortcut = ({
  className,
  ...props
}: React.ComponentProps<'span'>) => (
  <span
    data-slot="command-shortcut"
    className={cn(
      'ml-auto text-xs tracking-widest text-muted-foreground',
      className,
    )}
    {...props}
  />
)
