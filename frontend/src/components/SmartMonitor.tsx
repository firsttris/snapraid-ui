import {
  assessSmart,
  attributeLevel,
  CRC_ATTRIBUTE_ID,
  CRITICAL_CELSIUS,
  CRITICAL_FAILURE_PROBABILITY,
  CRITICAL_WEAR_PERCENT,
  DEFAULT_SMART_FAILURE_THRESHOLD,
  type ErrorAttribute,
  HOT_CELSIUS,
  type SmartAssessment,
  type SmartHint,
  type SmartLevel,
  type SmartReason,
  smartHints,
  WORN_PERCENT,
} from '@shared/smart-health'
import type { SmartDiskInfo } from '@shared/types'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNotificationSettings, useSmart } from '../hooks/queries'
import { formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'

interface SmartMonitorProps {
  configPath: string
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'OK':
      return 'text-green-600 bg-green-50'
    case 'FAIL':
      return 'text-red-600 bg-red-50'
    case 'PREFAIL':
      return 'text-orange-600 bg-orange-50'
    case 'LOGFAIL':
      return 'text-yellow-600 bg-yellow-50'
    case 'LOGERR':
      return 'text-yellow-600 bg-yellow-50'
    case 'SELFERR':
      return 'text-yellow-600 bg-yellow-50'
    default:
      return 'text-gray-600 bg-gray-50'
  }
}

const getStatusBadge = (status: string) => {
  const color = getStatusColor(status)
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${color}`}>
      {status}
    </span>
  )
}

const LEVEL_STYLES: Record<
  SmartLevel,
  { card: string; box: string; icon: string }
> = {
  ok: { card: 'border-gray-200', box: '', icon: '✅' },
  warning: {
    card: 'border-yellow-300 ring-1 ring-yellow-300',
    box: 'bg-yellow-50 text-yellow-800',
    icon: '⚠️',
  },
  critical: {
    card: 'border-red-400 ring-1 ring-red-400',
    box: 'bg-red-50 text-red-800',
    icon: '🚨',
  },
}

const ERROR_TEXT: Record<
  ErrorAttribute,
  (inputs: { count: number }) => string
> = {
  reported_uncorrectable: m.smart_reason_reported_uncorrectable,
  crc: m.smart_reason_crc,
  medium: m.smart_reason_medium_errors,
}

export const describeSmartReason = (reason: SmartReason): string => {
  switch (reason.kind) {
    case 'status':
      switch (reason.status) {
        case 'FAIL':
          return m.smart_reason_status_fail()
        case 'PREFAIL':
          return m.smart_reason_status_prefail()
        case 'LOGFAIL':
          return m.smart_reason_status_logfail()
        case 'LOGERR':
          return m.smart_reason_status_logerr()
        case 'SELFERR':
          return m.smart_reason_status_selferr()
        default:
          return reason.status
      }
    case 'unreadable':
      return m.smart_reason_unreadable()
    case 'errors':
      return ERROR_TEXT[reason.attribute]({ count: reason.count })
    case 'wear':
      return m.smart_reason_wear({ percent: reason.percent })
    case 'failure_probability':
      return m.smart_reason_probability({
        percent: formatPercent(reason.percent, 1),
      })
    case 'temperature':
      return m.smart_reason_temperature({ celsius: reason.celsius })
    case 'sectors':
      switch (reason.attribute) {
        case 'reallocated':
          return m.smart_reason_reallocated({ count: reason.count })
        case 'pending':
          return m.smart_reason_pending({ count: reason.count })
        case 'uncorrectable':
          return m.smart_reason_uncorrectable({ count: reason.count })
      }
  }
}

const HINT_TEXT: Record<SmartHint, () => string> = {
  replace: m.smart_hint_replace,
  cable: m.smart_hint_cable,
  cooling: m.smart_hint_cooling,
  access: m.smart_hint_access,
}

// SnapRAID rates healthy disks at a few percent per year, only the threshold is worth a color
const getFailureProbabilityColor = (probability: number, threshold: number) =>
  probability >= CRITICAL_FAILURE_PROBABILITY
    ? 'text-red-600'
    : probability >= threshold
      ? 'text-orange-600'
      : 'text-green-600'

const formatPercent = (value: number, digits: number) =>
  value.toLocaleString(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

// Same limits as assessSmart, warm is still fine
const getTemperatureColor = (celsius: number) =>
  celsius >= CRITICAL_CELSIUS
    ? 'text-red-600'
    : celsius > HOT_CELSIUS
      ? 'text-orange-600'
      : 'text-green-600'

const getWearColor = (percent: number) =>
  percent >= CRITICAL_WEAR_PERCENT
    ? 'text-red-600'
    : percent >= WORN_PERCENT
      ? 'text-orange-600'
      : 'text-green-600'

const ATTRIBUTE_ROW_STYLES: Record<SmartLevel, string> = {
  ok: '',
  warning: 'bg-yellow-50 text-yellow-800',
  critical: 'bg-red-50 text-red-800 font-semibold',
}

const formatYears = (hours: number) =>
  (hours / 24 / 365).toLocaleString(getLocale(), { maximumFractionDigits: 1 })

const driveType = (disk: SmartDiskInfo) =>
  disk.rotationRate === undefined
    ? undefined
    : disk.rotationRate === 0
      ? m.smart_monitor_ssd()
      : m.smart_monitor_hdd({ rpm: disk.rotationRate })

// Disks outside the array have no name, the device tells them apart
const diskKey = (disk: SmartDiskInfo) => `${disk.device}:${disk.name}`
const diskAnchor = (disk: SmartDiskInfo) =>
  `smart-disk-${diskKey(disk).replace(/[^\w-]/g, '_')}`

// Transfer errors that stopped growing, a past cable problem worth a mention but no warning
const StableCrcNote = ({ disk }: { disk: SmartDiskInfo }) => {
  const raw = disk.attributes?.find((attr) => attr.id === CRC_ATTRIBUTE_ID)?.raw
  if (!disk.crcStableSince || !raw) return null
  return (
    <p className="mb-3 text-sm text-gray-500">
      {m.smart_crc_stable({
        count: Number.parseInt(raw, 10).toLocaleString(getLocale()),
        date: new Date(disk.crcStableSince).toLocaleDateString(getLocale()),
      })}
    </p>
  )
}

const DiskCard = ({
  disk,
  assessment,
  threshold,
}: {
  disk: SmartDiskInfo
  assessment: SmartAssessment
  threshold: number
}) => {
  // Open right away when an attribute stands out, that is where the details are
  const [expanded, setExpanded] = useState(() =>
    (disk.attributes ?? []).some((attr) => attributeLevel(attr, disk) !== 'ok'),
  )
  const style = LEVEL_STYLES[assessment.level]

  return (
    <div
      id={diskAnchor(disk)}
      className={`scroll-mt-4 border rounded-lg p-4 hover:shadow-md transition-shadow ${style.card}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{disk.name}</h3>
            {disk.standby ? (
              <span className="px-2 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50">
                💤 {m.smart_monitor_standby()}
              </span>
            ) : (
              getStatusBadge(disk.status)
            )}
          </div>
          <p className="text-sm text-gray-600">
            {[disk.device, disk.interface, driveType(disk)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {(disk.model || disk.family) && (
            <p className="text-xs text-gray-500 mt-1">
              {[disk.family, disk.model].filter(Boolean).join(' · ')}
            </p>
          )}
          {disk.standby && (
            <p className="text-xs text-gray-500 mt-1">
              {m.smart_monitor_standby_hint()}
            </p>
          )}
        </div>

        {disk.temperature !== undefined && (
          <div className="text-right">
            <div
              className={`text-2xl font-bold ${getTemperatureColor(disk.temperature)}`}
            >
              {disk.temperature}°C
            </div>
            <div className="text-xs text-gray-500">
              {m.smart_monitor_temperature()}
            </div>
          </div>
        )}
      </div>

      {assessment.reasons.length > 0 && (
        <ul className={`mb-3 space-y-1 rounded-md p-3 text-sm ${style.box}`}>
          {assessment.reasons.map((reason) => (
            <li key={reason.kind + describeSmartReason(reason)}>
              {style.icon} {describeSmartReason(reason)}
            </li>
          ))}
        </ul>
      )}

      <StableCrcNote disk={disk} />

      <div className="grid grid-cols-2 gap-4 text-sm">
        {disk.failureProbability !== undefined && (
          <div>
            <div className="text-gray-500">
              {m.smart_monitor_failure_probability()}
            </div>
            <div
              className={`font-semibold ${getFailureProbabilityColor(disk.failureProbability, threshold)}`}
            >
              {formatPercent(disk.failureProbability, 2)} %{' '}
              <span className="text-xs font-normal text-gray-500">
                {m.smart_monitor_per_year()}
              </span>
            </div>
          </div>
        )}

        {disk.powerOnHours !== undefined && (
          <div>
            <div className="text-gray-500">
              {m.smart_monitor_power_on_hours()}
            </div>
            <div className="font-semibold">
              {disk.powerOnHours.toLocaleString(getLocale())}{' '}
              {m.smart_monitor_hours()}
              <span className="text-xs text-gray-500 ml-1">
                ({formatYears(disk.powerOnHours)} {m.smart_monitor_years()})
              </span>
            </div>
          </div>
        )}

        {disk.wearLevel !== undefined && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_wear_level()}</div>
            <div className={`font-semibold ${getWearColor(disk.wearLevel)}`}>
              {disk.wearLevel} %
            </div>
          </div>
        )}

        {/* Counters are only worth a line when they count something */}
        {!!disk.errorMedium && (
          <div>
            <div className="text-gray-500">
              {m.smart_monitor_media_errors()}
            </div>
            <div className="font-semibold text-orange-600">
              {disk.errorMedium.toLocaleString(getLocale())}
            </div>
          </div>
        )}

        {!!disk.errorProtocol && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_error_log()}</div>
            <div className="font-semibold">
              {disk.errorProtocol.toLocaleString(getLocale())}
            </div>
          </div>
        )}

        {disk.size && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_capacity()}</div>
            <div className="font-semibold text-sm">{disk.size}</div>
          </div>
        )}

        {disk.serial && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_serial()}</div>
            <div className="font-mono text-xs">{disk.serial}</div>
          </div>
        )}
      </div>

      {disk.attributes && disk.attributes.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {expanded ? '▼' : '▶'} {m.smart_monitor_attributes()} (
            {disk.attributes.length})
          </button>

          {expanded && (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">
                      {m.smart_monitor_id()}
                    </th>
                    <th className="px-2 py-1 text-left">
                      {m.smart_monitor_name()}
                    </th>
                    <th className="px-2 py-1 text-right">
                      {m.smart_monitor_value()}
                    </th>
                    <th className="px-2 py-1 text-right">
                      {m.smart_monitor_worst()}
                    </th>
                    <th className="px-2 py-1 text-right">
                      {m.smart_monitor_threshold()}
                    </th>
                    <th className="px-2 py-1 text-right">
                      {m.smart_monitor_raw()}
                    </th>
                    <th className="px-2 py-1 text-left">
                      {m.smart_monitor_status()}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {disk.attributes.map((attr) => (
                    <tr
                      key={attr.id}
                      className={`border-t ${ATTRIBUTE_ROW_STYLES[attributeLevel(attr, disk)]}`}
                    >
                      <td className="px-2 py-1">{attr.id}</td>
                      <td className="px-2 py-1">{attr.name}</td>
                      <td className="px-2 py-1 text-right">{attr.value}</td>
                      <td className="px-2 py-1 text-right">{attr.worst}</td>
                      <td className="px-2 py-1 text-right">{attr.threshold}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {attr.raw}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {attr.flag}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const SmartMonitor = ({ configPath }: SmartMonitorProps) => {
  const [showRawOutput, setShowRawOutput] = useState(false)
  const {
    data: report,
    isLoading: loading,
    isFetching,
    error: queryError,
    refetch,
  } = useSmart(configPath || undefined)
  const error = queryError?.message

  // Same threshold as the SMART notifications, so the page and the messages agree
  const { data: notificationSettings } = useNotificationSettings()
  const threshold =
    notificationSettings?.smartFailureThreshold ??
    DEFAULT_SMART_FAILURE_THRESHOLD

  const assessed = (report?.disks ?? []).map((disk) => ({
    disk,
    assessment: assessSmart(disk, threshold),
  }))
  const problems = assessed.filter(
    ({ assessment }) => assessment.level !== 'ok',
  )
  const critical = problems.filter(
    ({ assessment }) => assessment.level === 'critical',
  )
  const warnings = problems.filter(
    ({ assessment }) => assessment.level === 'warning',
  )

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{m.smart_monitor_title()}</h2>
          {report && (
            <p
              className="text-sm text-gray-500 mt-1"
              title={new Date(report.timestamp).toLocaleString(getLocale())}
            >
              {m.smart_monitor_last_updated()}:{' '}
              {formatRelativeTime(report.timestamp, getLocale())}
            </p>
          )}
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="secondary"
          size="iconSm"
          aria-label={m.smart_monitor_refresh()}
          title={m.smart_monitor_refresh()}
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
        </Button>
      </div>

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {m.smart_monitor_loading_hint()}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          <strong>{m.smart_monitor_error()}:</strong> {error}
        </div>
      )}

      {report && report.disks.length > 0 && problems.length === 0 && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">
            ✅ {m.smart_monitor_all_ok({ count: report.disks.length })}
          </p>
          <p className="mt-1">{m.smart_monitor_all_ok_hint()}</p>
        </div>
      )}

      {[
        {
          group: critical,
          style: 'border-red-200 bg-red-50 text-red-800',
          title: `🚨 ${m.smart_monitor_critical_message()}`,
        },
        {
          group: warnings,
          style: 'border-yellow-200 bg-yellow-50 text-yellow-800',
          title: `⚠️ ${m.smart_monitor_warning_message()}`,
        },
      ]
        .filter(({ group }) => group.length > 0)
        .map(({ group, style, title }) => (
          <div
            key={title}
            className={`mb-4 rounded-lg border p-4 text-sm ${style}`}
          >
            <p className="font-semibold">{title}</p>
            <ul className="mt-2 space-y-1">
              {group.map(({ disk, assessment }) => (
                <li key={diskKey(disk)}>
                  <a
                    href={`#${diskAnchor(disk)}`}
                    className="font-semibold underline hover:no-underline"
                  >
                    {disk.name}
                  </a>
                  {': '}
                  {assessment.reasons.map(describeSmartReason).join(', ')}
                </li>
              ))}
            </ul>
            {smartHints(group.map(({ assessment }) => assessment)).map(
              (hint) => (
                <p key={hint} className="mt-2">
                  → {HINT_TEXT[hint]()}
                </p>
              ),
            )}
          </div>
        ))}

      {report?.arrayFailureProbability !== undefined && (
        <div className="mb-4 flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-sm">
          {/* Grows with the number of disks, the per-disk threshold does not apply */}
          <div className="text-2xl font-bold">
            {formatPercent(report.arrayFailureProbability, 0)} %
          </div>
          <div>
            <p className="font-semibold">{m.smart_monitor_array_failure()}</p>
            <p className="text-gray-500">
              {m.smart_monitor_array_failure_hint()}
            </p>
          </div>
        </div>
      )}

      {report && report.disks.length > 0 ? (
        <>
          <div className="grid gap-4 mb-4">
            {assessed.map(({ disk, assessment }) => (
              <DiskCard
                key={diskKey(disk)}
                disk={disk}
                assessment={assessment}
                threshold={threshold}
              />
            ))}
          </div>

          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowRawOutput(!showRawOutput)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              {showRawOutput ? '▼' : '▶'} {m.smart_monitor_show_raw_output()}
            </button>
            {showRawOutput && (
              <pre className="mt-2 p-4 bg-gray-50 rounded text-xs overflow-x-auto">
                {report.rawOutput}
              </pre>
            )}
          </div>
        </>
      ) : (
        !loading &&
        !error && (
          <div className="text-center py-8 text-gray-500">
            {m.smart_monitor_no_disks()}
          </div>
        )
      )}
    </div>
  )
}
