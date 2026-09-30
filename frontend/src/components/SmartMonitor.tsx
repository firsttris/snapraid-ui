import {
  assessSmart,
  DEFAULT_SMART_FAILURE_THRESHOLD,
  type SmartAssessment,
  type SmartLevel,
  type SmartReason,
} from '@shared/smart-health'
import type { SmartDiskInfo, SmartReport } from '@shared/types'
import { useState } from 'react'
import { useNotificationSettings } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Button } from './Button'

interface SmartMonitorProps {
  configPath: string
  onRefresh: () => Promise<SmartReport>
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

// SnapRAID rates healthy disks at a few percent per year, only the threshold is worth a color
const getFailureProbabilityColor = (probability: number, threshold: number) =>
  probability >= 50
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
  celsius >= 60
    ? 'text-red-600'
    : celsius > 50
      ? 'text-orange-600'
      : 'text-green-600'

const diskAnchor = (disk: SmartDiskInfo) => `smart-disk-${disk.name}`

const DiskCard = ({
  disk,
  assessment,
  threshold,
}: {
  disk: SmartDiskInfo
  assessment: SmartAssessment
  threshold: number
}) => {
  const [expanded, setExpanded] = useState(false)
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
            {getStatusBadge(disk.status)}
          </div>
          <p className="text-sm text-gray-600">{disk.device}</p>
          {disk.model && (
            <p className="text-xs text-gray-500 mt-1">{disk.model}</p>
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
                ({Math.floor(disk.powerOnHours / 24 / 365)}{' '}
                {m.smart_monitor_years()})
              </span>
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
                  </tr>
                </thead>
                <tbody>
                  {disk.attributes.map((attr) => (
                    <tr key={attr.id} className="border-t">
                      <td className="px-2 py-1">{attr.id}</td>
                      <td className="px-2 py-1">{attr.name}</td>
                      <td className="px-2 py-1 text-right">{attr.value}</td>
                      <td className="px-2 py-1 text-right">{attr.worst}</td>
                      <td className="px-2 py-1 text-right">{attr.threshold}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {attr.raw}
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

export const SmartMonitor = ({ onRefresh }: SmartMonitorProps) => {
  const [report, setReport] = useState<SmartReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRawOutput, setShowRawOutput] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await onRefresh()
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

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
            <p className="text-sm text-gray-500 mt-1">
              {m.smart_monitor_last_updated()}:{' '}
              {new Date(report.timestamp).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          {loading ? m.smart_monitor_loading() : m.smart_monitor_refresh()}
        </Button>
      </div>

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
                <li key={disk.name}>
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
          </div>
        ))}

      {report && report.disks.length > 0 ? (
        <>
          <div className="grid gap-4 mb-4">
            {assessed.map(({ disk, assessment }) => (
              <DiskCard
                key={disk.name}
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
            {m.smart_monitor_no_data()}
          </div>
        )
      )}
    </div>
  )
}
