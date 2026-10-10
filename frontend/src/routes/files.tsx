import type { SnapRaidFileInfo } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Folder,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { ConfigBar } from '../components/ConfigBar'
import { errorMessage } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { LoadingHint } from '../components/Skeleton'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { getFileList } from '../lib/api/snapraid'
import { folderTrail, folderView, searchFiles } from '../lib/protected-files'
import { cn, formatBytes } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/files')({
  component: FilesPage,
})

// Search results and files of a folder shown at most
const MAX_ROWS = 200

function FilesPage() {
  const { selectedConfig } = useSelectedConfig()
  const job = useJob()
  // list reads only the content file, no disk spins up
  const list = useQuery({
    queryKey: ['protected-files', selectedConfig],
    queryFn: () => getFileList(selectedConfig),
    enabled: !!selectedConfig,
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <PageLayout
      title={m.nav_files()}
      description={<p className="max-w-3xl">{m.files_intro()}</p>}
      actions={
        selectedConfig && (
          <Button
            variant="outline"
            onClick={() => list.refetch()}
            disabled={list.isFetching || job.isRunning}
          >
            <RefreshCw
              className={cn('size-4', list.isFetching && 'animate-spin')}
            />
            {m.recovery_refresh()}
          </Button>
        )
      }
    >
      <ConfigBar>
        {list.isLoading ? (
          <LoadingHint>{m.files_loading()}</LoadingHint>
        ) : list.error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              {m.files_error({ error: errorMessage(list.error) })}
            </AlertDescription>
          </Alert>
        ) : (
          <FilesContent
            key={selectedConfig}
            files={list.data?.files ?? []}
            totalSize={list.data?.totalSize ?? 0}
          />
        )}
      </ConfigBar>
    </PageLayout>
  )
}

const FileTable = ({
  files,
  showPath,
}: {
  files: SnapRaidFileInfo[]
  showPath: boolean
}) => (
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5">{m.recovery_col_path()}</TableHead>
          <TableHead>{m.recovery_col_disk()}</TableHead>
          <TableHead className="text-right">{m.changes_col_size()}</TableHead>
          <TableHead className="pr-5 text-right">
            {m.files_col_modified()}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={`${file.disk}|${file.name}`}>
            <TableCell className="pl-5 font-mono text-[13px] break-all whitespace-normal">
              {showPath ? file.name : file.name.replace(/^.*\//, '')}
            </TableCell>
            <TableCell>
              {file.disk && <Badge variant="outline">{file.disk}</Badge>}
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
              {formatBytes(file.size)}
            </TableCell>
            <TableCell className="pr-5 text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums">
              {file.date} {file.time}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

function FilesContent({
  files,
  totalSize,
}: {
  files: SnapRaidFileInfo[]
  totalSize: number
}) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [folder, setFolder] = useState('')
  const found = useMemo(
    () => searchFiles(files, deferredSearch, MAX_ROWS),
    [files, deferredSearch],
  )
  const view = useMemo(() => folderView(files, folder), [files, folder])
  const number = (value: number) => value.toLocaleString(getLocale())

  if (files.length === 0) {
    return (
      <Card className="items-center px-8 py-10 text-center shadow-none">
        <ShieldQuestion className="size-8 text-muted-foreground" />
        <p className="max-w-lg text-muted-foreground">{m.files_none()}</p>
      </Card>
    )
  }

  const largestFolder = Math.max(...view.folders.map((f) => f.bytes), 1)

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 px-5 py-4">
          <label
            htmlFor="file-search"
            className="flex items-center gap-2 font-semibold"
          >
            <ShieldCheck className="size-4 text-green-600" />
            {m.files_search_label()}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="file-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={m.files_search_placeholder()}
              className="h-10 pl-9"
            />
          </div>
        </div>
        {deferredSearch.trim() &&
          (found.total === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-yellow-50/60 px-5 py-3 text-sm text-yellow-900">
              <span>{m.files_not_found()}</span>
              <Button asChild variant="outline" size="sm">
                <Link to="/changes" search={{ tab: 'added' }}>
                  {m.files_open_new()}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-green-50/60 px-5 py-3 text-sm text-green-800">
                <span>
                  {found.total > found.matches.length
                    ? m.files_found_more({
                        count: number(found.total),
                        shown: number(found.matches.length),
                      })
                    : m.files_found({ count: number(found.total) })}
                </span>
                {/* Where the matches are, all of them */}
                <span className="flex flex-wrap gap-1.5">
                  {found.disks.map((disk) => (
                    <Badge
                      key={disk.disk}
                      variant="outline"
                      className="bg-card"
                      title={formatBytes(disk.bytes)}
                    >
                      {disk.disk || '–'}
                      <span className="text-muted-foreground tabular-nums">
                        {number(disk.files)}
                      </span>
                    </Badge>
                  ))}
                </span>
              </div>
              <div className="border-t">
                <FileTable files={found.matches} showPath />
              </div>
            </>
          ))}
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <nav
          aria-label={m.files_browse_title()}
          className="flex flex-wrap items-center gap-1 px-5 py-3 text-sm"
        >
          <span className="mr-2 font-semibold">{m.files_browse_title()}</span>
          <button
            type="button"
            onClick={() => setFolder('')}
            className="rounded px-1.5 py-0.5 hover:bg-muted"
          >
            {m.files_top()}
          </button>
          {folderTrail(folder).map((path) => (
            <span key={path} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setFolder(path)}
                className="rounded px-1.5 py-0.5 font-mono hover:bg-muted"
              >
                {path.replace(/^.*\//, '')}
              </button>
            </span>
          ))}
          <span className="ml-auto text-muted-foreground">
            {m.files_summary({
              files: number(files.length),
              size: formatBytes(totalSize),
            })}
          </span>
        </nav>
        {view.folders.map((entry) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => setFolder(entry.path)}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-t px-5 py-2.5 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_10rem_12rem]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-[13px]">
                {entry.name}
              </span>
              {entry.disks.map((disk) => (
                <Badge key={disk} variant="outline" className="text-[11px]">
                  {disk}
                </Badge>
              ))}
            </span>
            <span className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block">
              <span
                className="ui-bar ui-bar-glow block h-full rounded-full bg-primary/70"
                style={{ width: `${(entry.bytes / largestFolder) * 100}%` }}
              />
            </span>
            <span className="text-right text-sm text-muted-foreground tabular-nums">
              {m.changes_folder_total_size({
                count: number(entry.files),
                size: formatBytes(entry.bytes),
              })}
            </span>
          </button>
        ))}
        {view.files.length > 0 && (
          <div className="border-t">
            <p className="flex items-center gap-2 px-5 pt-3 text-xs font-medium text-muted-foreground">
              <FileText className="size-3.5" />
              {m.changes_folder_total({ count: number(view.files.length) })}
            </p>
            <FileTable files={view.files.slice(0, MAX_ROWS)} showPath={false} />
            {view.files.length > MAX_ROWS && (
              <p className="px-5 py-3 text-sm text-muted-foreground">
                {m.recovery_more({
                  count: String(view.files.length - MAX_ROWS),
                })}
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}
