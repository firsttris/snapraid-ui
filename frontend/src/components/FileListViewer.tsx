import type { SnapRaidFileInfo } from '@shared/types'
import { Search } from 'lucide-react'
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
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

interface FileListViewerProps {
  files: SnapRaidFileInfo[]
  totalFiles: number
  totalSize: number
  totalLinks: number
  isLoading?: boolean
  onClose: () => void
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
}

const StatTile = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-lg border px-3 py-2">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums">{value}</p>
  </div>
)

export function FileListViewer({
  files,
  totalFiles,
  totalSize,
  totalLinks,
  isLoading,
  onClose,
}: FileListViewerProps) {
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
          <DialogTitle>{m.filelist_title()}</DialogTitle>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {m.common_loading()}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-left sm:max-w-md">
              <StatTile
                label={m.filelist_files()}
                value={totalFiles.toLocaleString(locale)}
              />
              <StatTile
                label={m.filelist_size()}
                value={formatBytes(totalSize)}
              />
              <StatTile
                label={m.filelist_links()}
                value={totalLinks.toLocaleString(locale)}
              />
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
          ) : files.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.filelist_no_files()}
            </p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.report_filter_no_match()}
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[120px] text-right">
                    {m.filelist_size()}
                  </TableHead>
                  <TableHead className="w-[110px]">
                    {m.filelist_date()}
                  </TableHead>
                  <TableHead className="w-[90px]">
                    {m.filelist_time()}
                  </TableHead>
                  <TableHead>{m.filelist_name()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((file, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: read-only report rows, never reordered; names may repeat
                  <TableRow key={index}>
                    <TableCell className="py-2 text-right font-mono tabular-nums">
                      {formatBytes(file.size)}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-muted-foreground tabular-nums">
                      {file.date}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-muted-foreground tabular-nums">
                      {file.time}
                    </TableCell>
                    <TableCell
                      className="max-w-[500px] truncate py-2 font-mono"
                      title={file.name}
                    >
                      {file.name}
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
