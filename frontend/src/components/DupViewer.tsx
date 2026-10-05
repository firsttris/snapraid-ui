import type { DuplicateFile } from '@shared/types'
import { CircleCheck, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

interface DupViewerProps {
  duplicates: DuplicateFile[]
  totalSize: number
  isLoading?: boolean
  onClose: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
}

// Largest first, that is where deleting a copy frees the most space
const bySize = (a: DuplicateFile, b: DuplicateFile) => b.size - a.size

const DiskPath = ({ disk, name }: { disk: string; name: string }) => (
  <span className="flex items-start gap-2">
    <Badge variant="parity" className="mt-px font-mono">
      {disk}
    </Badge>
    <span className="break-all">{name}</span>
  </span>
)

export const DupViewer = ({
  duplicates,
  totalSize,
  isLoading,
  onClose,
}: DupViewerProps) => {
  const [filter, setFilter] = useState('')
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase())
  const sorted = useMemo(() => [...duplicates].sort(bySize), [duplicates])
  const shown = useMemo(
    () =>
      deferredFilter
        ? sorted.filter(
            (dup) =>
              dup.name.toLowerCase().includes(deferredFilter) ||
              dup.originalName.toLowerCase().includes(deferredFilter),
          )
        : sorted,
    [sorted, deferredFilter],
  )
  const locale = getLocale()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-6xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="gap-3 border-b p-6 pr-12 pb-4">
          <DialogTitle>{m.dup_title()}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? m.common_loading()
              : m.dup_summary({
                  count: duplicates.length,
                  size: formatBytes(totalSize),
                })}
          </DialogDescription>
          <p className="text-xs text-muted-foreground">{m.dup_hint()}</p>
          {!isLoading && duplicates.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={m.report_filter_placeholder()}
                  aria-label={m.report_filter_placeholder()}
                  className="pl-8"
                />
              </div>
              {deferredFilter && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {m.report_filter_count({
                    shown: shown.length.toLocaleString(locale),
                    total: duplicates.length.toLocaleString(locale),
                  })}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.common_loading()}
            </p>
          ) : duplicates.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-green-700" />
              {m.dup_none()}
            </p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.report_filter_no_match()}
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[110px] text-right">
                    {m.filelist_size()}
                  </TableHead>
                  <TableHead>{m.dup_duplicate()}</TableHead>
                  <TableHead>{m.dup_same_as()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((dup) => (
                  <TableRow
                    key={`${dup.disk}:${dup.name}`}
                    className="align-top"
                  >
                    <TableCell className="py-2 text-right align-top font-mono tabular-nums">
                      {formatBytes(dup.size)}
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal py-2 align-top font-mono">
                      <DiskPath disk={dup.disk} name={dup.name} />
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal py-2 align-top font-mono text-muted-foreground">
                      <DiskPath
                        disk={dup.originalDisk}
                        name={dup.originalName}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
