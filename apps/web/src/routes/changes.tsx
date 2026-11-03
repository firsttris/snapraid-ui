import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, History, RefreshCw, Search, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfigBar } from '../components/ConfigBar'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { LoadingHint } from '../components/Skeleton'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useSchedules } from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { executeCommand, getDiff, restoreFiles } from '../lib/api/snapraid'
import {
  type ChangeEntry,
  folderTotals,
  MAX_RESTORE,
  matchesChange,
  matchesSearch,
  otherChanges,
  type RecoveryKind,
  recoverableFiles,
} from '../lib/recovery'
import { cn, formatBytes, formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export type ChangeTab = RecoveryKind | 'added' | 'other'
const TABS: ChangeTab[] = ['deleted', 'changed', 'added', 'other']

export const Route = createFileRoute('/changes')({
  // Recover files opens it at the deleted files
  validateSearch: (search: Record<string, unknown>): { tab?: ChangeTab } =>
    TABS.includes(search.tab as ChangeTab)
      ? { tab: search.tab as ChangeTab }
      : {},
  component: ChangesPage,
})

// A long list stays usable, the search narrows it down
const MAX_ROWS = 300

function ChangesPage() {
  const { selectedConfig } = useSelectedConfig()
  const job = useJob()
  // diff reads every file's metadata, it runs when the page opens or on request, not on focus
  const diff = useQuery({
    queryKey: ['recovery-diff', selectedConfig],
    queryFn: () => getDiff(selectedConfig),
    enabled: !!selectedConfig && !job.isRunning,
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <PageLayout
      title={m.changes_title()}
      description={<p className="max-w-3xl">{m.changes_intro()}</p>}
      actions={
        selectedConfig && (
          <Button
            variant="outline"
            onClick={() => diff.refetch()}
            disabled={diff.isFetching || job.isRunning}
          >
            <RefreshCw
              className={cn('size-4', diff.isFetching && 'animate-spin')}
            />
            {m.recovery_refresh()}
          </Button>
        )
      }
    >
      <ConfigBar>
        <ChangesContent
          configPath={selectedConfig}
          diff={diff.data}
          isLoading={diff.isLoading}
          error={diff.error}
          refetch={() => diff.refetch()}
        />
      </ConfigBar>
    </PageLayout>
  )
}

function ChangesContent({
  configPath,
  diff,
  isLoading,
  error,
  refetch,
}: {
  configPath: string
  diff: Awaited<ReturnType<typeof getDiff>> | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}) {
  const { confirm, toast } = useFeedback()
  const job = useJob()
  const { data: schedules } = useSchedules()
  const { tab: requestedTab } = Route.useSearch()
  const navigate = useNavigate()
  const { requestCommand } = useAppShell()
  const [chosenTab, setKind] = useState<ChangeTab | undefined>(requestedTab)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Restored in this visit. A file fixed in place can still show as changed until the next
  // sync: SnapRAID leaves its time as is when that could mix it up with another file.
  const [restored, setRestored] = useState<Set<string>>(new Set())
  const restoring = useRef<string[]>([])
  const all = useMemo(() => recoverableFiles(diff), [diff])
  const others = useMemo(() => otherChanges(diff), [diff])
  const files = useMemo(
    () => ({
      deleted: all.deleted.filter((file) => !restored.has(file.key)),
      changed: all.changed.filter((file) => !restored.has(file.key)),
    }),
    [all, restored],
  )

  // Once the restore finished, the files are no longer deleted or changed
  const wasRunning = useRef(job.isRunning)
  useEffect(() => {
    if (wasRunning.current && !job.isRunning) {
      const result = job.lastResult
      if (result?.command === 'fix' && result.exitCode === 0) {
        const keys = restoring.current
        setRestored((prev) => new Set([...prev, ...keys]))
      }
      restoring.current = []
      setSelected(new Set())
      refetch()
    }
    wasRunning.current = job.isRunning
  }, [job.isRunning, job.lastResult, refetch])

  const configFile = configPath.replace(/^.*[/\\]/, '')
  const nextSync = schedules
    ?.filter(
      (schedule) =>
        schedule.enabled &&
        schedule.command === 'sync' &&
        !schedule.skipNext &&
        schedule.nextRun &&
        schedule.configPath.replace(/^.*[/\\]/, '') === configFile,
    )
    .map((schedule) => schedule.nextRun as string)
    .sort()[0]

  if (isLoading) return <LoadingHint>{m.recovery_loading()}</LoadingHint>
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription>
          {m.recovery_error({ error: errorMessage(error) })}
        </AlertDescription>
      </Alert>
    )
  }

  const counts: Record<ChangeTab, number> = {
    deleted: files.deleted.length,
    changed: files.changed.length,
    added: others.added.length,
    other: others.other.length,
  }
  // Until a tab is picked, the first one with files
  const kind: ChangeTab =
    chosenTab ?? TABS.find((tab) => counts[tab] > 0) ?? 'deleted'
  const restoreTab = kind === 'deleted' || kind === 'changed'
  const list = restoreTab ? files[kind] : []
  const visible = list.filter((file) => matchesSearch(file, search))
  const changes =
    kind === 'added' ? others.added : kind === 'other' ? others.other : []
  const visibleChanges = changes.filter((file) => matchesChange(file, search))
  const newBytes = others.added.reduce((sum, file) => sum + (file.size ?? 0), 0)
  const chosen = list.filter((file) => selected.has(file.key))
  const allVisibleSelected =
    visible.length > 0 && visible.every((file) => selected.has(file.key))

  const toggle = (key: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  const toggleVisible = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const file of visible) {
        if (checked) next.add(file.key)
        else next.delete(file.key)
      }
      return next
    })

  const handleRestore = async () => {
    if (chosen.length > MAX_RESTORE) {
      toast.error(m.recovery_too_many({ max: String(MAX_RESTORE) }))
      return
    }
    const confirmed = await confirm({
      message:
        kind === 'changed'
          ? m.recovery_confirm_changed({ count: String(chosen.length) })
          : m.recovery_confirm_deleted({ count: String(chosen.length) }),
      confirmLabel: m.recovery_restore({ count: String(chosen.length) }),
      danger: kind === 'changed',
    })
    if (!confirmed) return
    restoring.current = chosen.map((file) => file.key)
    job.start('fix')
    try {
      await restoreFiles(
        configPath,
        chosen.map(({ disk, path }) => ({ disk, path })),
      )
      toast.success(m.recovery_started({ count: String(chosen.length) }))
    } catch (restoreError) {
      job.fail('fix', errorMessage(restoreError))
    }
  }

  // Every deleted file at once (snapraid fix -m), also more than one run takes, e.g. after an
  // accidental rm -rf; changed files stay as they are
  const handleRestoreAllDeleted = async () => {
    const count = String(files.deleted.length)
    const confirmed = await confirm({
      message: m.recovery_confirm_all_deleted({ count }),
      confirmLabel: m.recovery_restore_all_deleted({ count }),
    })
    if (!confirmed) return
    restoring.current = files.deleted.map((file) => file.key)
    job.start('fix')
    try {
      await executeCommand('fix', configPath, ['-m'])
      toast.success(m.recovery_started({ count }))
    } catch (restoreError) {
      job.fail('fix', errorMessage(restoreError))
    }
  }

  const empty = TABS.every((tab) => counts[tab] === 0)

  // The dashboard opens the sync preview, which shows the same changes once more
  const startSync = () => {
    requestCommand('sync')
    navigate({ to: '/' })
  }

  return (
    <>
      {restored.size > 0 && (
        <Alert variant="success">
          <History />
          <AlertDescription className="text-inherit">
            {m.recovery_restored({ count: String(restored.size) })}
          </AlertDescription>
        </Alert>
      )}
      {nextSync && !empty && (
        <Alert variant="warning">
          <History />
          <AlertDescription className="text-inherit">
            {m.recovery_next_sync({
              when: formatRelativeTime(nextSync, getLocale()),
            })}
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <Card className="items-center px-8 py-10 text-center shadow-none">
          <History className="size-8 text-muted-foreground" />
          <p className="max-w-lg text-muted-foreground">
            {m.changes_nothing()}
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex-row flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {m.changes_summary({
                  added: counts.added,
                  changed: counts.changed,
                  deleted: counts.deleted,
                  other: counts.other,
                })}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {counts.added > 0 && newBytes > 0
                  ? m.changes_summary_hint_size({ size: formatBytes(newBytes) })
                  : m.changes_summary_hint()}
              </p>
            </div>
            <Button onClick={startSync} disabled={job.isRunning}>
              <RefreshCw className="size-4" />
              {m.changes_start_sync()}
            </Button>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <Tabs
                value={kind}
                onValueChange={(value) => {
                  setKind(value as ChangeTab)
                  setSelected(new Set())
                }}
              >
                <TabsList className="max-w-full justify-start overflow-x-auto">
                  <TabsTrigger value="deleted">
                    {m.recovery_tab_deleted()}
                    <Badge variant="secondary">{counts.deleted}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="changed">
                    {m.recovery_tab_changed()}
                    <Badge variant="secondary">{counts.changed}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="added">
                    {m.changes_tab_added()}
                    <Badge variant="secondary">{counts.added}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="other">
                    {m.changes_tab_other()}
                    <Badge variant="secondary">{counts.other}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={m.recovery_search()}
                  aria-label={m.recovery_search()}
                  className="pl-8"
                />
              </div>
            </div>

            {kind === 'changed' && list.length > 0 && (
              <p className="border-t bg-yellow-50/60 px-5 py-3 text-sm text-yellow-900">
                {m.recovery_changed_hint()}
              </p>
            )}

            {!restoreTab ? (
              <ChangeList
                kind={kind}
                files={changes}
                visible={visibleChanges}
              />
            ) : list.length === 0 ? (
              <p className="border-t px-5 py-6 text-sm text-muted-foreground">
                {kind === 'deleted'
                  ? m.recovery_none_deleted()
                  : m.recovery_none_changed()}
              </p>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 pl-5">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(value) =>
                            toggleVisible(value === true)
                          }
                          aria-label={m.recovery_select_all()}
                        />
                      </TableHead>
                      <TableHead>{m.recovery_col_path()}</TableHead>
                      <TableHead>{m.recovery_col_disk()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.slice(0, MAX_ROWS).map((file) => (
                      <TableRow key={file.key}>
                        <TableCell className="pl-5">
                          <Checkbox
                            checked={selected.has(file.key)}
                            onCheckedChange={(value) =>
                              toggle(file.key, value === true)
                            }
                            aria-label={file.path}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-[13px] break-all whitespace-normal">
                          {file.path}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{file.disk}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {visible.length > MAX_ROWS && (
                  <p className="px-5 py-3 text-sm text-muted-foreground">
                    {m.recovery_more({
                      count: String(visible.length - MAX_ROWS),
                    })}
                  </p>
                )}
              </div>
            )}

            {restoreTab && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-3">
                {kind === 'deleted' && files.deleted.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleRestoreAllDeleted}
                    disabled={job.isRunning}
                    className="mr-auto"
                  >
                    <Undo2 />
                    {m.recovery_restore_all_deleted({
                      count: String(files.deleted.length),
                    })}
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  {m.recovery_selected({ count: String(chosen.length) })}
                </span>
                <Button
                  onClick={handleRestore}
                  disabled={chosen.length === 0 || job.isRunning}
                  variant={kind === 'changed' ? 'destructive' : 'default'}
                >
                  <History />
                  {m.recovery_restore({ count: String(chosen.length) })}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}

const KIND_LABEL: Record<string, () => string> = {
  moved: m.changes_kind_moved,
  copied: m.changes_kind_copied,
  restored: m.changes_kind_restored,
}

// New files with their totals per folder, or moved and copied ones; nothing to do about them
function ChangeList({
  kind,
  files,
  visible,
}: {
  kind: 'added' | 'other'
  files: ChangeEntry[]
  visible: ChangeEntry[]
}) {
  const totals = kind === 'added' ? folderTotals(files).slice(0, 8) : []
  if (files.length === 0) {
    return (
      <p className="border-t px-5 py-6 text-sm text-muted-foreground">
        {kind === 'added' ? m.changes_none_added() : m.changes_none_other()}
      </p>
    )
  }
  return (
    <>
      <p className="border-t bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
        {kind === 'added' ? m.changes_added_hint() : m.changes_other_hint()}
      </p>
      {totals.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t px-5 py-3">
          {totals.map((total) => (
            <span
              key={total.folder}
              className="rounded-md border bg-card px-2.5 py-1 text-xs"
            >
              <span className="font-mono">{total.folder || '/'}</span>
              <span className="ml-1.5 text-muted-foreground tabular-nums">
                {total.sized
                  ? m.changes_folder_total_size({
                      count: total.files,
                      size: formatBytes(total.bytes),
                    })
                  : m.changes_folder_total({ count: total.files })}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">{m.recovery_col_path()}</TableHead>
              <TableHead>{m.recovery_col_disk()}</TableHead>
              <TableHead className="text-right">
                {kind === 'added' ? m.changes_col_size() : m.changes_col_kind()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, MAX_ROWS).map((file) => (
              <TableRow key={`${file.disk}|${file.path}`}>
                <TableCell className="pl-5 font-mono text-[13px] break-all whitespace-normal">
                  {file.path}
                </TableCell>
                <TableCell>
                  {file.disk && <Badge variant="outline">{file.disk}</Badge>}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                  {kind === 'added'
                    ? file.size !== undefined && formatBytes(file.size)
                    : KIND_LABEL[file.status]?.()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length > MAX_ROWS && (
          <p className="px-5 py-3 text-sm text-muted-foreground">
            {m.recovery_more({ count: String(visible.length - MAX_ROWS) })}
          </p>
        )}
      </div>
    </>
  )
}
