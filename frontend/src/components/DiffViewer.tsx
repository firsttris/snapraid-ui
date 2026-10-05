import type { DiffFileInfo } from '@shared/types'
import {
  ArrowRightLeft,
  Check,
  CircleCheck,
  Copy,
  type LucideIcon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

interface DiffViewerProps {
  files: DiffFileInfo[]
  totalFiles: number
  equalFiles: number
  newFiles: number
  modifiedFiles: number
  deletedFiles: number
  movedFiles: number
  copiedFiles: number
  restoredFiles: number
  isLoading?: boolean
  onClose: () => void
}

const STATUS: Record<
  DiffFileInfo['status'],
  { label: () => string; icon: LucideIcon; tint: string; text: string }
> = {
  equal: {
    label: m.diff_report_equal,
    icon: Check,
    tint: 'bg-green-50 text-green-700',
    text: 'text-green-700',
  },
  added: {
    label: m.diff_report_new,
    icon: Plus,
    tint: 'bg-blue-50 text-blue-700',
    text: 'text-blue-700',
  },
  removed: {
    label: m.diff_report_deleted,
    icon: Trash2,
    tint: 'bg-red-50 text-red-700',
    text: 'text-red-700',
  },
  updated: {
    label: m.diff_report_modified,
    icon: Pencil,
    tint: 'bg-orange-50 text-orange-700',
    text: 'text-orange-700',
  },
  moved: {
    label: m.diff_report_moved,
    icon: ArrowRightLeft,
    tint: 'bg-purple-50 text-purple-700',
    text: 'text-purple-700',
  },
  copied: {
    label: m.diff_report_copied,
    icon: Copy,
    tint: 'bg-cyan-50 text-cyan-700',
    text: 'text-cyan-700',
  },
  restored: {
    label: m.diff_report_restored,
    icon: RotateCcw,
    tint: 'bg-green-50 text-green-700',
    text: 'text-green-700',
  },
}

const StatTile = ({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) => (
  <div className="rounded-lg border px-3 py-2">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn('text-lg font-semibold tabular-nums', className)}>
      {value}
    </p>
  </div>
)

export function DiffViewer({
  files,
  totalFiles,
  equalFiles,
  newFiles,
  modifiedFiles,
  deletedFiles,
  movedFiles,
  copiedFiles,
  restoredFiles,
  isLoading,
  onClose,
}: DiffViewerProps) {
  const [filter, setFilter] = useState('')
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase())
  const shown = useMemo(
    () =>
      deferredFilter
        ? files.filter((file) =>
            file.name.toLowerCase().includes(deferredFilter),
          )
        : files,
    [files, deferredFilter],
  )
  const locale = getLocale()

  const totalChanges =
    newFiles +
    modifiedFiles +
    deletedFiles +
    movedFiles +
    copiedFiles +
    restoredFiles
  const hasChanges = totalChanges > 0

  const stats: Array<{ status: DiffFileInfo['status']; count: number }> = [
    { status: 'equal', count: equalFiles },
    { status: 'added', count: newFiles },
    { status: 'updated', count: modifiedFiles },
    { status: 'removed', count: deletedFiles },
    { status: 'moved', count: movedFiles },
    { status: 'copied', count: copiedFiles },
    { status: 'restored', count: restoredFiles },
  ]

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
        aria-describedby={undefined}
      >
        <DialogHeader className="gap-4 border-b p-6 pr-12 pb-4">
          <DialogTitle>{m.diff_report_title()}</DialogTitle>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {m.common_loading()}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4 lg:grid-cols-8">
              <StatTile
                label={m.diff_report_total()}
                value={totalFiles.toLocaleString(locale)}
              />
              {stats
                .filter(({ count }) => count > 0)
                .map(({ status, count }) => (
                  <StatTile
                    key={status}
                    label={STATUS[status].label()}
                    value={count.toLocaleString(locale)}
                    className={STATUS[status].text}
                  />
                ))}
            </div>
          )}
          {!isLoading && files.length > 0 && (
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
                    total: files.length.toLocaleString(locale),
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
          ) : !hasChanges && files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CircleCheck className="size-12 text-green-700" />
              <p className="text-base font-semibold">
                {m.diff_report_all_sync()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.diff_report_no_changes()}
              </p>
            </div>
          ) : shown.length === 0 && files.length > 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.report_filter_no_match()}
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px]">
                    {m.diff_report_status()}
                  </TableHead>
                  <TableHead>{m.diff_report_file_path()}</TableHead>
                  <TableHead className="w-[160px]">
                    {m.diff_report_size()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((file, index) => {
                  const status = STATUS[file.status]
                  const Icon = status?.icon
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: read-only report rows, never reordered; names may repeat
                    <TableRow key={index}>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={cn('border-transparent', status?.tint)}
                        >
                          {Icon && <Icon />}
                          {status?.label() ?? file.status}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[500px] truncate py-2 font-mono"
                        title={file.name}
                      >
                        {file.name}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-muted-foreground tabular-nums">
                        {file.size || '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {!isLoading && hasChanges && (
          <div className="border-t p-4">
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{m.diff_report_changes_detected()}</AlertTitle>
              <AlertDescription>
                {m.diff_report_changes_message({ count: totalChanges })}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
