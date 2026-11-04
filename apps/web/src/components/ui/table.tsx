import type * as React from 'react'
import { cn } from '@/lib/utils'

export const Table = ({
  className,
  ...props
}: React.ComponentProps<'table'>) => (
  <div data-slot="table-container" className="relative w-full overflow-x-auto">
    <table
      data-slot="table"
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
)

export const TableHeader = ({
  className,
  ...props
}: React.ComponentProps<'thead'>) => (
  <thead
    data-slot="table-header"
    className={cn('bg-muted/50 [&_tr]:border-b', className)}
    {...props}
  />
)

export const TableBody = ({
  className,
  ...props
}: React.ComponentProps<'tbody'>) => (
  <tbody
    data-slot="table-body"
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
)

export const TableRow = ({
  className,
  ...props
}: React.ComponentProps<'tr'>) => (
  <tr
    data-slot="table-row"
    className={cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      className,
    )}
    {...props}
  />
)

export const TableHead = ({
  className,
  ...props
}: React.ComponentProps<'th'>) => (
  <th
    data-slot="table-head"
    className={cn(
      'h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export const TableCell = ({
  className,
  ...props
}: React.ComponentProps<'td'>) => (
  <td
    data-slot="table-cell"
    className={cn('whitespace-nowrap px-4 py-3 align-middle', className)}
    {...props}
  />
)
