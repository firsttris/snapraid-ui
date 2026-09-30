import type {
  DiskPowerStatus,
  DiskStatusInfo,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
  SnapRaidStatus,
} from '@shared/types'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { formatGB, usageBarColor } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { LoadingHint, Skeleton } from './Skeleton'

// Parity reserve below this share of the fullest data disk is flagged as tight
const PARITY_TIGHT_RATIO = 0.05

interface DisksPanelProps {
  parsedConfig: ParsedSnapRaidConfig | undefined
  status: SnapRaidStatus | undefined
  parityUsage: ParityLevelUsage[] | undefined
  powerStates: DiskPowerStatus[] | undefined
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

const TONE_BADGE: Record<Warning['tone'], string> = {
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-700',
}

const TONE_ICON: Record<Tone, string> = { ok: '✓', warning: '⚠', error: '⚠' }

const usageWarning = (percent: number): Warning | null => {
  if (percent >= 95) return { tone: 'error', text: m.disks_almost_full() }
  if (percent >= 85) return { tone: 'warning', text: m.disks_filling_up() }
  return null
}

const formatCount = (count: number) => count.toLocaleString(getLocale())

const PowerDot = ({
  state,
}: {
  state: DiskPowerStatus['status'] | undefined
}) => {
  if (!state || state === 'Unknown') return <span className="w-2.5 shrink-0" />
  const [className, label] =
    state === 'Standby'
      ? ['border-2 border-gray-400', m.disks_power_standby()]
      : state === 'Idle'
        ? ['bg-green-300', m.disks_power_idle()]
        : ['bg-green-500', m.disks_power_active()]
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      title={label}
      role="img"
      aria-label={label}
    />
  )
}

const UsageBar = ({
  percent,
  barClass,
}: {
  percent: number
  barClass: string
}) => (
  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
    <div
      className={`h-full rounded-full ${barClass}`}
      style={{ width: `${Math.min(percent, 100)}%` }}
    />
  </div>
)

const DiskRow = ({
  name,
  role,
  roleClass,
  paths,
  power,
  percent,
  barClass,
  free,
  warning,
  details,
  loading = false,
}: {
  name: string
  role: string
  roleClass: string
  paths: string[]
  power: DiskPowerStatus['status'] | undefined
  percent: number | undefined
  barClass: string
  free: number | undefined
  warning: Warning | null
  details: ReactNode
  loading?: boolean
}) => (
  <li className="grid items-center gap-x-6 gap-y-2 py-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_11rem]">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <PowerDot state={power} />
        <span className="truncate font-medium text-gray-900">{name}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleClass}`}
        >
          {role}
        </span>
      </div>
      {paths.map((path) => (
        // rtl moves the ellipsis to the start, the end of a path tells disks apart
        <p
          key={path}
          dir="rtl"
          className="truncate pl-4.5 text-left text-xs text-gray-500"
          title={path}
        >
          <bdi>{path}</bdi>
        </p>
      ))}
    </div>

    <div className="min-w-0">
      {loading ? (
        <>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="mt-2 h-3 w-24" />
        </>
      ) : (
        <>
          {percent !== undefined && (
            <UsageBar percent={percent} barClass={barClass} />
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
            {details}
          </div>
        </>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-2 text-sm md:justify-end">
      {loading && <Skeleton className="h-4 w-28" />}
      {!loading && percent !== undefined && free !== undefined && (
        <span className="text-gray-700">
          <span className="font-semibold">{percent}%</span> ·{' '}
          {m.disks_free({ free: formatGB(free) })}
        </span>
      )}
      {warning && (
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${TONE_BADGE[warning.tone]}`}
        >
          {warning.text}
        </span>
      )}
    </div>
  </li>
)

const DataDetails = ({ stats }: { stats: DiskStatusInfo | undefined }) => {
  if (!stats) return <span>{m.disks_no_stats()}</span>
  return (
    <>
      <span>{m.disks_files({ count: formatCount(stats.files) })}</span>
      {stats.fragmentedFiles > 0 && (
        <span>
          {m.disks_fragmented({ count: formatCount(stats.fragmentedFiles) })}
        </span>
      )}
      {stats.wastedGB > 0 && (
        <span>{m.disks_wasted({ size: formatGB(stats.wastedGB) })}</span>
      )}
    </>
  )
}

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
    ? { free, percent: Math.round((1 - free / total) * 100) }
    : undefined
}

// Rows until the config says which disks there are
const SkeletonRow = () => (
  <li className="grid items-center gap-x-6 gap-y-2 py-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_11rem]">
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-36" />
    </div>
    <div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
    <Skeleton className="h-4 w-28 md:justify-self-end" />
  </li>
)

export const DisksPanel = ({
  parsedConfig,
  status,
  parityUsage,
  powerStates,
  isConfigLoading,
  isStatusLoading,
  isParityLoading,
}: DisksPanelProps) => {
  // A config that fails to parse shows nothing, as before
  if (!parsedConfig && !isConfigLoading) return null

  const statusPending = !status && isStatusLoading
  const parityPending = !parityUsage && isParityLoading

  const statsByName = new Map(status?.disks?.map((disk) => [disk.name, disk]))
  const powerByName = new Map(
    powerStates?.map((disk) => [disk.name, disk.status]),
  )
  const fullest = status?.disks?.reduce<DiskStatusInfo | undefined>(
    (max, disk) => (!max || disk.usedGB > max.usedGB ? disk : max),
    undefined,
  )

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold">{m.disks_title()}</h2>
        <div className="flex flex-wrap items-baseline gap-x-4 text-sm text-gray-500">
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
          <Link to="/smart" className="text-blue-600 hover:underline">
            {m.disks_smart_link()} →
          </Link>
        </div>
      </div>

      <ul className="mt-2 divide-y divide-gray-100">
        {!parsedConfig && [1, 2, 3].map((row) => <SkeletonRow key={row} />)}
        {Object.entries(parsedConfig?.data ?? {}).map(([name, path]) => {
          const stats = statsByName.get(name)
          return (
            <DiskRow
              key={name}
              name={name}
              role={m.disks_role_data()}
              roleClass="bg-blue-50 text-blue-700"
              paths={[path]}
              power={powerByName.get(name)}
              percent={stats?.usePercent}
              barClass={usageBarColor(stats?.usePercent ?? 0)}
              free={stats?.freeGB}
              warning={stats ? usageWarning(stats.usePercent) : null}
              details={<DataDetails stats={stats} />}
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

          return (
            <DiskRow
              key={parity.keyword}
              name={parity.keyword}
              role={m.disks_role_parity({ level: String(parity.level) })}
              roleClass="bg-purple-50 text-purple-700"
              paths={parity.paths}
              power={powerByName.get(parity.keyword)}
              percent={filesystem?.percent}
              // The parity file fills its disk by design, the check below is what matters
              barClass="bg-purple-500"
              free={filesystem?.free}
              warning={null}
              loading={parityPending}
              details={
                <>
                  {fileSize === null ? (
                    <span>{m.disks_parity_not_created()}</span>
                  ) : (
                    fileSize !== undefined && (
                      <span>
                        {m.disks_parity_file({ size: formatGB(fileSize) })}
                      </span>
                    )
                  )}
                  {check && (
                    <span className={`font-medium ${TONE_TEXT[check.tone]}`}>
                      {TONE_ICON[check.tone]} {check.text}
                    </span>
                  )}
                </>
              }
            />
          )
        })}
      </ul>
    </div>
  )
}
