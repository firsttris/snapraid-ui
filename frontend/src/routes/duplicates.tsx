import type { DuplicateDeletion, DuplicateSkip } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CircleCheck,
  Copy,
  History,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ConfigBar } from '../components/ConfigBar'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { SegmentedControl } from '../components/SegmentedControl'
import { LoadingHint } from '../components/Skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { deleteDuplicates, getDup } from '../lib/api/snapraid'
import {
  type DuplicateCopy,
  type DuplicateGroup,
  deletionsOf,
  duplicateGroups,
  type KeepRule,
  keptCopy,
  matchesGroup,
} from '../lib/duplicates'
import { cn, formatBytes } from '../lib/utils'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/duplicates')({
  component: DuplicatesPage,
})

// A long list stays usable, the search narrows it down
const MAX_GROUPS = 100
// The backend deletes at most this many copies at once (MAX_DUPLICATE_DELETIONS)
const MAX_DELETIONS = 5000

const SKIP_REASON: Record<DuplicateSkip['reason'], () => string> = {
  changed_since_sync: m.duplicates_reason_changed,
  missing: m.duplicates_reason_missing,
  size_differs: m.duplicates_reason_size,
  kept_copy_deleted: m.duplicates_reason_kept,
  outside_disk: m.duplicates_reason_outside,
  unknown_disk: m.duplicates_reason_unknown_disk,
  failed: m.duplicates_reason_failed,
}

interface CleanupResult {
  deleted: DuplicateDeletion[]
  skipped: DuplicateSkip[]
}

function DuplicatesPage() {
  const { selectedConfig } = useSelectedConfig()
  const job = useJob()
  // dup reads only the content file; the page checks which copies are still there
  const dup = useQuery({
    queryKey: ['duplicates', selectedConfig],
    queryFn: () => getDup(selectedConfig),
    enabled: !!selectedConfig && !job.isRunning,
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <PageLayout
      title={m.dup_title()}
      description={<p className="max-w-3xl">{m.duplicates_intro()}</p>}
      actions={
        selectedConfig && (
          <Button
            variant="outline"
            onClick={() => dup.refetch()}
            disabled={dup.isFetching || job.isRunning}
          >
            <RefreshCw
              className={cn('size-4', dup.isFetching && 'animate-spin')}
            />
            {m.recovery_refresh()}
          </Button>
        )
      }
    >
      <ConfigBar>
        {dup.isLoading ? (
          <LoadingHint>{m.duplicates_loading()}</LoadingHint>
        ) : dup.error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              {m.duplicates_error({ error: errorMessage(dup.error) })}
            </AlertDescription>
          </Alert>
        ) : (
          <DuplicatesContent
            key={selectedConfig}
            configPath={selectedConfig}
            groups={duplicateGroups(dup.data?.duplicates)}
            refetch={() => dup.refetch()}
          />
        )}
      </ConfigBar>
    </PageLayout>
  )
}

function DuplicatesContent({
  configPath,
  groups,
  refetch,
}: {
  configPath: string
  groups: DuplicateGroup[]
  refetch: () => void
}) {
  const { confirm, toast } = useFeedback()
  const job = useJob()
  const [rule, setRule] = useState<KeepRule>('first')
  const [prefer, setPrefer] = useState('')
  const [search, setSearch] = useState('')
  // Copies picked by hand win over the rule, by group
  const [picked, setPicked] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)

  const keepOf = (group: DuplicateGroup): DuplicateCopy =>
    group.copies.find((copy) => copy.key === picked.get(group.id)) ??
    keptCopy(group, rule, prefer)

  const visible = useMemo(
    () => groups.filter((group) => matchesGroup(group, search)),
    [groups, search],
  )
  const chosen = groups.filter((group) => selected.has(group.id))
  const deletions = chosen.flatMap((group) => deletionsOf(group, keepOf(group)))
  const freed = deletions.reduce((sum, file) => sum + file.size, 0)
  const totalCopies = groups.reduce((sum, g) => sum + g.copies.length - 1, 0)
  const totalWasted = groups.reduce((sum, g) => sum + g.wasted, 0)
  const allVisibleSelected =
    visible.length > 0 && visible.every((group) => selected.has(group.id))

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  const toggleVisible = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const group of visible) {
        if (checked) next.add(group.id)
        else next.delete(group.id)
      }
      return next
    })

  const handleDelete = async () => {
    if (deletions.length > MAX_DELETIONS) {
      toast.error(m.duplicates_too_many({ max: String(MAX_DELETIONS) }))
      return
    }
    const confirmed = await confirm({
      title: m.duplicates_confirm_title(),
      message: m.duplicates_confirm({
        count: String(deletions.length),
        size: formatBytes(freed),
      }),
      confirmLabel: m.duplicates_delete({ count: String(deletions.length) }),
      danger: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      setResult(await deleteDuplicates(configPath, deletions))
      setSelected(new Set())
      setPicked(new Map())
      refetch()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  const deletedBytes =
    result?.deleted.reduce((sum, file) => sum + file.size, 0) ?? 0

  return (
    <>
      {result && result.deleted.length > 0 && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-inherit">
            <span>
              {m.duplicates_deleted({
                count: String(result.deleted.length),
                size: formatBytes(deletedBytes),
              })}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/changes" search={{ tab: 'deleted' }}>
                <History />
                {m.duplicates_open_changes()}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {result && result.skipped.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>
            {m.duplicates_skipped({ count: String(result.skipped.length) })}
          </AlertTitle>
          <AlertDescription className="text-inherit">
            <ul className="mt-1 flex flex-col gap-1">
              {result.skipped.slice(0, 20).map((skip) => (
                <li key={`${skip.disk}|${skip.path}`}>
                  <span className="font-mono text-xs break-all">
                    {skip.disk}/{skip.path}
                  </span>
                  {' – '}
                  {SKIP_REASON[skip.reason]()}
                  {skip.error && `: ${skip.error}`}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {groups.length === 0 ? (
        <Card className="items-center px-8 py-10 text-center shadow-none">
          <Copy className="size-8 text-muted-foreground" />
          <p className="max-w-lg text-muted-foreground">{m.dup_none()}</p>
          <p className="max-w-lg text-sm text-muted-foreground">
            {m.dup_hint()}
          </p>
        </Card>
      ) : (
        <>
          <Card className="gap-1 px-5 py-4">
            <p className="font-medium">
              {m.duplicates_summary({
                groups: String(groups.length),
                copies: String(totalCopies),
                size: formatBytes(totalWasted),
              })}
            </p>
            <p className="text-sm text-muted-foreground">{m.dup_hint()}</p>
          </Card>

          <Card lift className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-5 py-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {m.duplicates_rule_label()}
                </span>
                <SegmentedControl<KeepRule>
                  value={rule}
                  onChange={(value) => {
                    setRule(value)
                    setPicked(new Map())
                  }}
                  options={[
                    { value: 'first', label: m.duplicates_rule_first() },
                    { value: 'shortest', label: m.duplicates_rule_shortest() },
                  ]}
                />
              </div>
              <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                <label
                  htmlFor="duplicates-prefer"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {m.duplicates_prefer()}
                </label>
                <Input
                  id="duplicates-prefer"
                  value={prefer}
                  onChange={(e) => {
                    setPrefer(e.target.value)
                    setPicked(new Map())
                  }}
                  placeholder={m.duplicates_prefer_placeholder()}
                />
              </div>
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

            <div className="flex items-center gap-3 border-t bg-muted/40 px-5 py-2.5 text-sm">
              <Checkbox
                id="duplicates-select-all"
                checked={allVisibleSelected}
                onCheckedChange={(value) => toggleVisible(value === true)}
              />
              <label htmlFor="duplicates-select-all">
                {m.duplicates_select_all()}
              </label>
            </div>

            {visible.length === 0 ? (
              <p className="border-t px-5 py-6 text-sm text-muted-foreground">
                {m.duplicates_no_match()}
              </p>
            ) : (
              visible
                .slice(0, MAX_GROUPS)
                .map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    keep={keepOf(group)}
                    selected={selected.has(group.id)}
                    onSelect={(checked) => toggle(group.id, checked)}
                    onKeep={(key) =>
                      setPicked((prev) => new Map(prev).set(group.id, key))
                    }
                  />
                ))
            )}
            {visible.length > MAX_GROUPS && (
              <p className="border-t px-5 py-3 text-sm text-muted-foreground">
                {m.recovery_more({
                  count: String(visible.length - MAX_GROUPS),
                })}
              </p>
            )}

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t bg-card px-5 py-3">
              <span className="text-sm text-muted-foreground">
                {m.duplicates_selected({
                  count: String(deletions.length),
                  size: formatBytes(freed),
                })}
              </span>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deletions.length === 0 || deleting || job.isRunning}
              >
                <Trash2 />
                {m.duplicates_delete({ count: String(deletions.length) })}
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function GroupRow({
  group,
  keep,
  selected,
  onSelect,
  onKeep,
}: {
  group: DuplicateGroup
  keep: DuplicateCopy
  selected: boolean
  onSelect: (checked: boolean) => void
  onKeep: (key: string) => void
}) {
  const name = keep.path.replace(/^.*\//, '')
  const id = useId()
  return (
    <div
      data-testid="duplicate-group"
      className={cn('border-t px-5 py-3', selected && 'bg-muted/30')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelect(value === true)}
          aria-label={m.duplicates_select_group({ name })}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {m.duplicates_group_info({
            count: String(group.copies.length),
            size: formatBytes(group.size),
            freed: formatBytes(group.wasted),
          })}
        </span>
      </div>
      <RadioGroup
        value={keep.key}
        onValueChange={onKeep}
        className="mt-2 gap-1.5 pl-7"
        aria-label={m.duplicates_keep_label({ name })}
      >
        {group.copies.map((copy, index) => {
          const kept = copy.key === keep.key
          return (
            <div key={copy.key} className="flex items-start gap-2.5 text-sm">
              <RadioGroupItem
                id={`${id}-${index}`}
                value={copy.key}
                className="mt-0.5"
              />
              <label
                htmlFor={`${id}-${index}`}
                className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5"
              >
                <Badge variant="outline" className="font-mono">
                  {copy.disk}
                </Badge>
                <span
                  className={cn(
                    'min-w-0 flex-1 font-mono text-[13px] break-all',
                    selected && !kept && 'text-muted-foreground line-through',
                  )}
                >
                  {copy.path}
                </span>
              </label>
              {kept ? (
                <Badge variant="success">{m.duplicates_keeps()}</Badge>
              ) : (
                selected && (
                  <Badge variant="destructive">{m.duplicates_deletes()}</Badge>
                )
              )}
            </div>
          )
        })}
      </RadioGroup>
    </div>
  )
}
