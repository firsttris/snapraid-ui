import type {
  DataDiskUsage,
  DiskIssue,
  DiskPowerStatus,
  DiskStatusInfo,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
  SmartHistoryPoint,
  SnapRaidStatus,
  UsagePoint,
} from '@shared/types'
import { diskFreeSeries, forecastFill } from '@shared/usage-forecast'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpFromLine, Moon, MoreHorizontal } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { cn, formatGB, usageBarColor } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { LoadingHint, Skeleton } from './Skeleton'
import {
  sparklinePoints,
  temperatureSeries,
  temperatureTone,
} from './temperatureTrend'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { hasUsageHistory } from './usageHistory'

// chart.js is only loaded once the history tab is opened
const UsageHistoryChart = lazy(() =>
  import('./UsageHistoryChart').then((module) => ({
    default: module.UsageHistoryChart,
  })),
)

// Parity reserve below this share of the fullest data disk is flagged as tight
const PARITY_TIGHT_RATIO = 0.05

interface DisksPanelProps {
  parsedConfig: ParsedSnapRaidConfig | undefined
  status: SnapRaidStatus | undefined
  parityUsage: ParityLevelUsage[] | undefined
  dataDiskUsage: DataDiskUsage[] | undefined
  usageHistory: UsagePoint[] | undefined
  powerStates: DiskPowerStatus[] | undefined
  smartCritical: string[] // Disks SMART rates critical
  // Current temperature by disk from the live SMART read, and the daily history for the trend
  temperatures?: Record<string, number | undefined>
  smartHistory?: Record<string, SmartHistoryPoint[]>
  // Spin one disk, or all of them without a name, up or down
  onPower?: (action: 'up' | 'down', disk?: string) => void
  powerDisabled?: boolean
  // status and parity usage come from slower SnapRAID and df calls than the config
  isConfigLoading: boolean
  isStatusLoading: boolean
  isParityLoading: boolean
}

type Tone = 'ok' | 'warning' | 'error'
type Warning = { tone: Exclude<Tone, 'ok'>; text: string }

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-green-700',
  warning: 'text-yellow-700',
  error: 'text-red-700',
}

const TONE_BADGE: Record<Warning['tone'], 'warning' | 'destructive'> = {
  warning: 'warning',
  error: 'destructive',
}

const TONE_ICON: Record<Tone, string> = { ok: '✓', warning: '⚠', error: '⚠' }

const usageWarning = (percent: number): Warning | null => {
  if (percent >= 95) return { tone: 'error', text: m.disks_almost_full() }
  if (percent >= 85) return { tone: 'warning', text: m.disks_filling_up() }
  return null
}

const formatCount = (count: number) => count.toLocaleString(getLocale())

const ISSUE_LABEL: Record<DiskIssue['kind'], () => string> = {
  missing: m.disks_issue_missing,
  empty: m.disks_issue_empty,
  uuid_changed: m.disks_issue_uuid_changed,
}

// Problems of the disk itself, ahead of the usage notes
const DiskAlerts = ({
  issue,
  smartCritical,
}: {
  issue: DiskIssue | undefined
  smartCritical: boolean
}) => (
  <>
    {issue && (
      <Badge
        variant={issue.kind === 'uuid_changed' ? 'warning' : 'destructive'}
        title={issue.path}
      >
        {ISSUE_LABEL[issue.kind]()}
      </Badge>
    )}
    {smartCritical && (
      <Badge variant="destructive">{m.disks_smart_critical()}</Badge>
    )}
  </>
)

const PowerDot = ({
  state,
}: {
  state: DiskPowerStatus['status'] | undefined
}) => {
  if (!state || state === 'Unknown') return <span className="size-2 shrink-0" />
  const [className, label] =
    state === 'Standby'
      ? ['border-2 border-gray-400', m.disks_power_standby()]
      : state === 'Idle'
        ? ['bg-green-300', m.disks_power_idle()]
        : ['ui-led bg-green-500', m.disks_power_active()]
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${className}`}
      title={label}
      role="img"
      aria-label={label}
    />
  )
}

const TONE_STROKE = {
  ok: 'stroke-muted-foreground/60',
  warm: 'stroke-yellow-600',
  hot: 'stroke-red-600',
}
const TONE_VALUE = {
  ok: 'text-foreground',
  warm: 'text-yellow-700',
  hot: 'text-red-700',
}

// Current temperature, with the trend of the last month when SMART was read on several days
const TemperatureTrend = ({
  current,
  points,
}: {
  current: number | undefined
  points: SmartHistoryPoint[] | undefined
}) => {
  const series = temperatureSeries(points)
  const value = current ?? series.at(-1)
  if (value === undefined)
    return <span className="text-muted-foreground">–</span>
  const tone = temperatureTone(value)
  const line = sparklinePoints(series, 44, 16)
  const range =
    series.length > 1
      ? m.disks_temperature_range({
          min: String(Math.min(...series)),
          max: String(Math.max(...series)),
          days: String(series.length),
        })
      : undefined
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono tabular-nums"
      title={range}
    >
      {line && (
        <svg
          width="44"
          height="16"
          viewBox="0 0 44 16"
          aria-hidden="true"
          className="shrink-0"
        >
          <polyline
            points={line}
            fill="none"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={TONE_STROKE[tone]}
          />
        </svg>
      )}
      <span className={TONE_VALUE[tone]}>{value} °C</span>
    </span>
  )
}

const PowerMenu = ({
  name,
  onPower,
  disabled,
}: {
  name: string
  onPower: (action: 'up' | 'down', disk?: string) => void
  disabled: boolean
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m.disks_actions({ disk: name })}
      >
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>{name}</DropdownMenuLabel>
      <DropdownMenuItem
        disabled={disabled}
        onSelect={() => onPower('up', name)}
      >
        <ArrowUpFromLine />
        {m.disks_spin_up()}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabled}
        onSelect={() => onPower('down', name)}
      >
        <Moon />
        {m.disks_spin_down()}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

const UsageBar = ({
  percent,
  barClass,
}: {
  percent: number
  barClass: string
}) => (
  <div className="flex items-center gap-3">
    <div className="h-2 min-w-24 flex-1 rounded-full bg-muted">
      <div
        className={`ui-bar ui-bar-glow h-full rounded-full ${barClass}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
    <span
      className={cn(
        'w-10 text-right font-mono text-xs tabular-nums',
        percent >= 95
          ? 'text-red-700'
          : percent >= 85
            ? 'text-yellow-700'
            : 'text-foreground',
      )}
    >
      {percent}%
    </span>
  </div>
)

const DiskRow = ({
  name,
  role,
  isParity,
  paths,
  power,
  percent,
  barClass,
  files,
  free,
  total,
  notes,
  temperature,
  actions,
  loading = false,
}: {
  name: string
  role: string
  isParity: boolean
  paths: string[]
  power: DiskPowerStatus['status'] | undefined
  percent: number | undefined
  barClass: string
  files: ReactNode
  free: number | undefined
  total: number | undefined
  notes: ReactNode
  temperature?: ReactNode // First in the status column, when SMART knows one
  actions?: ReactNode
  loading?: boolean
}) => (
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-2.5">
        <PowerDot state={power} />
        <div className="min-w-0 max-w-36 flex-1 @4xl:max-w-64">
          <p className="truncate font-medium">{name}</p>
          {paths.map((path) => (
            // rtl moves the ellipsis to the start, the end of a path tells disks apart
            <p
              key={path}
              dir="rtl"
              className="truncate text-left font-mono text-xs text-muted-foreground"
              title={path}
            >
              <bdi>{path}</bdi>
            </p>
          ))}
        </div>
        {actions}
      </div>
    </TableCell>
    <TableCell>
      <Badge variant={isParity ? 'parity' : 'outline'}>{role}</Badge>
    </TableCell>
    <TableCell className="w-[30%] @4xl:w-[34%]">
      {loading ? (
        <Skeleton className="h-2 w-full rounded-full" />
      ) : (
        percent !== undefined && (
          <UsageBar percent={percent} barClass={barClass} />
        )
      )}
    </TableCell>
    <TableCell
      className={cn(FILES_COLUMN, 'font-mono text-[13px] tabular-nums')}
    >
      {loading ? <Skeleton className="h-4 w-14" /> : files}
    </TableCell>
    <TableCell className="text-right font-mono text-[13px] tabular-nums">
      {loading ? (
        <Skeleton className="ml-auto h-4 w-16" />
      ) : (
        free !== undefined && (
          <span
            title={
              total !== undefined
                ? m.disks_free_of({
                    free: formatGB(free),
                    total: formatGB(total),
                  })
                : m.disks_free({ free: formatGB(free) })
            }
          >
            {formatGB(free)}
          </span>
        )
      )}
    </TableCell>
    <TableCell className="min-w-36 whitespace-normal">
      {loading ? (
        <Skeleton className="h-4 w-28" />
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {temperature}
          {notes}
        </div>
      )}
    </TableCell>
  </TableRow>
)

// Only worth a line while the disk would fill up within a year
const FORECAST_MAX_DAYS = 365
const FORECAST_URGENT_DAYS = 60

const FillForecastNote = ({ daysUntilFull }: { daysUntilFull?: number }) => {
  if (daysUntilFull === undefined || daysUntilFull > FORECAST_MAX_DAYS)
    return null
  const urgent = daysUntilFull <= FORECAST_URGENT_DAYS
  return (
    <Badge
      variant={urgent ? 'destructive' : 'warning'}
      title={m.disks_forecast_hint()}
    >
      {m.disks_forecast({ days: String(daysUntilFull) })}
    </Badge>
  )
}

const DataNotes = ({
  stats,
  warning,
  power,
  daysUntilFull,
}: {
  stats: DiskStatusInfo | undefined
  warning: Warning | null
  power: DiskPowerStatus['status'] | undefined
  daysUntilFull?: number
}) => (
  <>
    {warning && (
      <Badge variant={TONE_BADGE[warning.tone]}>{warning.text}</Badge>
    )}
    {!stats && <span>{m.disks_no_stats()}</span>}
    {stats && stats.fragmentedFiles > 0 && (
      <span>
        {m.disks_fragmented({ count: formatCount(stats.fragmentedFiles) })}
      </span>
    )}
    {stats && stats.wastedGB > 0 && (
      <span>{m.disks_wasted({ size: formatGB(stats.wastedGB) })}</span>
    )}
    <FillForecastNote daysUntilFull={daysUntilFull} />
    {power === 'Standby' && <span>{m.disks_power_standby()}</span>}
  </>
)

/**
 * Whether the parity can still grow to the size of the fullest data disk.
 * SnapRAID aborts a sync with "out of parity" otherwise.
 */
const getParityCheck = (
  usage: ParityLevelUsage | undefined,
  fullest: DiskStatusInfo | undefined,
): { tone: Tone; text: string } | null => {
  if (!usage) return null
  if (usage.capacityGB === null) {
    return { tone: 'error', text: m.disks_parity_unreachable() }
  }
  if (!fullest) return null

  const reserve = usage.capacityGB - fullest.usedGB
  if (reserve < 0) {
    return {
      tone: 'error',
      text: m.disks_parity_too_small({
        capacity: formatGB(usage.capacityGB),
        disk: fullest.name,
        used: formatGB(fullest.usedGB),
      }),
    }
  }
  if (reserve < fullest.usedGB * PARITY_TIGHT_RATIO) {
    return {
      tone: 'warning',
      text: m.disks_parity_tight({
        reserve: formatGB(reserve),
        disk: fullest.name,
      }),
    }
  }
  return { tone: 'ok', text: m.disks_parity_ok({ reserve: formatGB(reserve) }) }
}

// Split parity files may share a filesystem, count each one once
const sumFilesystems = (usage: ParityLevelUsage) => {
  const filesystems = new Map<string, { total: number; free: number }>()
  for (const file of usage.files) {
    if (file.mount && file.diskTotalGB !== null && file.diskFreeGB !== null) {
      filesystems.set(file.mount, {
        total: file.diskTotalGB,
        free: file.diskFreeGB,
      })
    }
  }
  if (filesystems.size === 0) return undefined
  const values = [...filesystems.values()]
  const total = values.reduce((sum, fs) => sum + fs.total, 0)
  const free = values.reduce((sum, fs) => sum + fs.free, 0)
  return total > 0
    ? { free, total, percent: Math.round((1 - free / total) * 100) }
    : undefined
}

// The file count is the least needed column, it makes room for the status on tablets
const FILES_COLUMN = 'hidden @4xl:table-cell'

// Rows until the config says which disks there are
const SkeletonRow = () => (
  <TableRow>
    <TableCell>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
    </TableCell>
    <TableCell>
      <Skeleton className="h-5 w-14 rounded-full" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-2 w-full rounded-full" />
    </TableCell>
    <TableCell className={FILES_COLUMN}>
      <Skeleton className="h-4 w-14" />
    </TableCell>
    <TableCell>
      <Skeleton className="ml-auto h-4 w-16" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-28" />
    </TableCell>
  </TableRow>
)

export const DisksPanel = ({
  parsedConfig,
  status,
  parityUsage,
  dataDiskUsage,
  usageHistory,
  powerStates,
  smartCritical,
  temperatures = {},
  smartHistory = {},
  onPower,
  powerDisabled = false,
  isConfigLoading,
  isStatusLoading,
  isParityLoading,
}: DisksPanelProps) => {
  const [view, setView] = useState<'table' | 'history'>('table')

  // A config that fails to parse shows nothing, as before
  if (!parsedConfig && !isConfigLoading) return null

  const statusPending = !status && isStatusLoading
  const parityPending = !parityUsage && isParityLoading
  const showHistory = hasUsageHistory(usageHistory)

  const statsByName = new Map(status?.disks?.map((disk) => [disk.name, disk]))
  const sizeByName = new Map(dataDiskUsage?.map((disk) => [disk.name, disk]))
  const powerByName = new Map(
    powerStates?.map((disk) => [disk.name, disk.status]),
  )
  const issueByDisk = new Map(
    status?.diskIssues?.map((issue) => [`${issue.type}:${issue.disk}`, issue]),
  )
  const alertsOf = (type: DiskIssue['type'], name: string) => (
    <DiskAlerts
      issue={issueByDisk.get(`${type}:${name}`)}
      smartCritical={smartCritical.includes(name)}
    />
  )
  const showTemperature =
    Object.values(temperatures).some((value) => value !== undefined) ||
    Object.values(smartHistory).some((points) =>
      points.some((point) => point.temperature !== undefined),
    )
  const temperatureOf = (name: string) =>
    showTemperature ? (
      <TemperatureTrend
        current={temperatures[name]}
        points={smartHistory[name]}
      />
    ) : undefined
  const actionsOf = (name: string) =>
    onPower ? (
      <PowerMenu name={name} onPower={onPower} disabled={powerDisabled} />
    ) : undefined
  const fullest = status?.disks?.reduce<DiskStatusInfo | undefined>(
    (max, disk) => (!max || disk.usedGB > max.usedGB ? disk : max),
    undefined,
  )

  const table = (
    <Table className="min-w-[680px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{m.disks_col_disk()}</TableHead>
          <TableHead>{m.disks_col_type()}</TableHead>
          <TableHead>{m.disks_col_usage()}</TableHead>
          <TableHead className={FILES_COLUMN}>{m.disks_col_files()}</TableHead>
          <TableHead className="text-right">{m.disks_col_free()}</TableHead>
          <TableHead>{m.disks_col_status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!parsedConfig && [1, 2, 3].map((row) => <SkeletonRow key={row} />)}
        {Object.entries(parsedConfig?.data ?? {}).map(([name, path]) => {
          const stats = statsByName.get(name)
          // The filesystem's numbers when df can read it, a disk path can be a
          // subfolder that shares its filesystem with other data
          const size = sizeByName.get(name)
          const total = size?.totalGB ?? undefined
          const free = size?.freeGB ?? stats?.freeGB
          const percent =
            total && size?.freeGB != null
              ? Math.round((1 - size.freeGB / total) * 100)
              : stats?.usePercent
          const power = powerByName.get(name)
          return (
            <DiskRow
              key={name}
              name={name}
              role={m.disks_role_data()}
              isParity={false}
              paths={[path]}
              power={power}
              percent={percent}
              barClass={usageBarColor(percent ?? 0)}
              files={
                stats?.files !== undefined ? formatCount(stats.files) : '–'
              }
              free={free}
              total={total}
              notes={
                <>
                  {alertsOf('data', name)}
                  <DataNotes
                    stats={stats}
                    warning={
                      percent !== undefined ? usageWarning(percent) : null
                    }
                    power={power}
                    daysUntilFull={
                      usageHistory
                        ? forecastFill(diskFreeSeries(usageHistory, name))
                            ?.daysUntilFull
                        : undefined
                    }
                  />
                </>
              }
              temperature={temperatureOf(name)}
              actions={actionsOf(name)}
              loading={statusPending}
            />
          )
        })}

        {(parsedConfig?.parity ?? []).map((parity) => {
          const usage = parityUsage?.find(
            (level) => level.keyword === parity.keyword,
          )
          const filesystem = usage ? sumFilesystems(usage) : undefined
          const check = getParityCheck(usage, fullest)
          const fileSize = usage?.files.every(
            (file) => file.fileSizeGB === null,
          )
            ? null
            : usage?.files.reduce(
                (sum, file) => sum + (file.fileSizeGB ?? 0),
                0,
              )
          const power = powerByName.get(parity.keyword)

          return (
            <DiskRow
              key={parity.keyword}
              name={parity.keyword}
              role={m.disks_role_parity({ level: String(parity.level) })}
              isParity
              paths={parity.paths}
              power={power}
              percent={filesystem?.percent}
              // The parity file fills its disk by design, the check below is what matters
              barClass="bg-purple-500"
              files={
                fileSize != null && (
                  <span
                    title={m.disks_parity_file({ size: formatGB(fileSize) })}
                  >
                    {formatGB(fileSize)}
                  </span>
                )
              }
              free={filesystem?.free}
              total={filesystem?.total}
              temperature={temperatureOf(parity.keyword)}
              actions={actionsOf(parity.keyword)}
              loading={parityPending}
              notes={
                <>
                  {alertsOf('parity', parity.keyword)}
                  {fileSize === null && (
                    <span>{m.disks_parity_not_created()}</span>
                  )}
                  {check && (
                    <span className={`font-medium ${TONE_TEXT[check.tone]}`}>
                      {TONE_ICON[check.tone]} {check.text}
                    </span>
                  )}
                  {power === 'Standby' && (
                    <span>{m.disks_power_standby()}</span>
                  )}
                </>
              }
            />
          )
        })}
      </TableBody>
    </Table>
  )

  return (
    <Card lift className="@container gap-0 overflow-hidden py-0">
      <Tabs
        value={showHistory ? view : 'table'}
        onValueChange={(value) => setView(value as 'table' | 'history')}
        className="gap-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{m.disks_title()}</h2>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {(!parsedConfig || statusPending) && (
                <LoadingHint>{m.disks_loading()}</LoadingHint>
              )}
              {status?.totalUsedGB !== undefined &&
                status.totalFreeGB !== undefined && (
                  <span>
                    {m.disks_summary({
                      used: formatGB(status.totalUsedGB),
                      free: formatGB(status.totalFreeGB),
                    })}
                  </span>
                )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showHistory && (
              <TabsList>
                <TabsTrigger value="table">{m.disks_view_table()}</TabsTrigger>
                <TabsTrigger value="history">
                  {m.disks_view_history()}
                </TabsTrigger>
              </TabsList>
            )}
            {onPower && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={powerDisabled}>
                    <Moon />
                    {m.disks_power_all()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onPower('up')}>
                    <ArrowUpFromLine />
                    {m.disks_spin_up_all()}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onPower('down')}>
                    <Moon />
                    {m.disks_spin_down_all()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link to="/smart">
                {m.disks_smart_link()}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        <TabsContent value="table" className="border-t">
          {table}
        </TabsContent>
        {showHistory && (
          <TabsContent value="history" className="border-t px-5 py-4">
            <Suspense fallback={null}>
              <UsageHistoryChart points={usageHistory} />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </Card>
  )
}
