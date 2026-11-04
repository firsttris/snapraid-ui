import type { CheckFileInfo } from '@shared/types'
import {
  Check,
  CircleCheck,
  CircleHelp,
  type LucideIcon,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
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

interface CheckViewerProps {
  files: CheckFileInfo[]
  totalFiles: number
  errorCount: number
  rehashCount: number
  okCount: number
  isLoading?: boolean
  onClose: () => void
}

const STATUS_BADGE: Record<
  string,
  { variant: 'success' | 'destructive' | 'warning'; icon: LucideIcon }
> = {
  OK: { variant: 'success', icon: Check },
  ERROR: { variant: 'destructive', icon: X },
  REHASH: { variant: 'warning', icon: RefreshCw },
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

export function CheckViewer({
  files,
  totalFiles,
  errorCount,
  rehashCount,
  okCount,
  isLoading,
  onClose,
}: CheckViewerProps) {
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
          <DialogTitle>{m.check_report_title()}</DialogTitle>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {m.common_loading()}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4 lg:max-w-2xl">
              <StatTile
                label={m.check_report_total()}
                value={totalFiles.toLocaleString(locale)}
              />
              {errorCount > 0 && (
                <StatTile
                  label={m.check_report_errors()}
                  value={errorCount.toLocaleString(locale)}
                  className="text-red-700"
                />
              )}
              {rehashCount > 0 && (
                <StatTile
                  label={m.check_report_rehash()}
                  value={rehashCount.toLocaleString(locale)}
                  className="text-yellow-700"
                />
              )}
              {okCount > 0 && (
                <StatTile
                  label={m.check_report_ok()}
                  value={okCount.toLocaleString(locale)}
                  className="text-green-700"
                />
              )}
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
          ) : files.length === 0 && errorCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CircleCheck className="size-12 text-green-700" />
              <p className="text-base font-semibold">
                {m.check_report_all_success()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.check_report_no_errors()}
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
                  <TableHead className="w-[120px]">
                    {m.check_report_status()}
                  </TableHead>
                  <TableHead>{m.check_report_file_path()}</TableHead>
                  <TableHead className="w-[200px]">
                    {m.check_report_details()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((file, index) => {
                  const badge = STATUS_BADGE[file.status]
                  const Icon = badge?.icon ?? CircleHelp
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: read-only report rows, never reordered; names may repeat
                    <TableRow key={index}>
                      <TableCell className="py-2">
                        <Badge variant={badge?.variant ?? 'secondary'}>
                          <Icon />
                          {file.status}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[500px] truncate py-2 font-mono"
                        title={file.name}
                      >
                        {file.name}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {file.error || file.hash || '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {!isLoading && errorCount > 0 && (
          <div className="border-t p-4">
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{m.check_report_warning_title()}</AlertTitle>
              <AlertDescription>
                {m.check_report_warning_message({ count: errorCount })}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
