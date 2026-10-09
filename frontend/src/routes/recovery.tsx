import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { executeCommand, getDiff, restoreFiles } from '../lib/api/snapraid'
import {
  MAX_RESTORE,
  matchesSearch,
  type RecoveryKind,
  recoverableFiles,
} from '../lib/recovery'
import { cn, formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/recovery')({
  component: RecoveryPage,
})

// A long list stays usable, the search narrows it down
const MAX_ROWS = 300

function RecoveryPage() {
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
      title={m.recovery_title()}
      description={<p className="max-w-3xl">{m.recovery_intro()}</p>}
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
        <RecoveryContent
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

function RecoveryContent({
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
  const [kind, setKind] = useState<RecoveryKind>('deleted')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Restored in this visit. A file fixed in place can still show as changed until the next
  // sync: SnapRAID leaves its time as is when that could mix it up with another file.
  const [restored, setRestored] = useState<Set<string>>(new Set())
  const restoring = useRef<string[]>([])
  const all = useMemo(() => recoverableFiles(diff), [diff])
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

  const list = files[kind]
  const visible = list.filter((file) => matchesSearch(file, search))
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

  const empty = files.deleted.length === 0 && files.changed.length === 0

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
            {m.recovery_nothing()}
          </p>
        </Card>
      ) : (
        <Card lift className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <Tabs
              value={kind}
              onValueChange={(value) => {
                setKind(value as RecoveryKind)
                setSelected(new Set())
              }}
            >
              <TabsList>
                <TabsTrigger value="deleted">
                  {m.recovery_tab_deleted()}
                  <Badge variant="secondary">{files.deleted.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="changed">
                  {m.recovery_tab_changed()}
                  <Badge variant="secondary">{files.changed.length}</Badge>
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

          {list.length === 0 ? (
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
        </Card>
      )}
    </>
  )
}
