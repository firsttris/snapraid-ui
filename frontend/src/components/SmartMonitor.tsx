import { useState } from 'react'
import type { SmartReport, SmartDiskInfo } from '@shared/types'
import * as m from '../paraglide/messages'

interface SmartMonitorProps {
  configPath: string
  onRefresh: () => Promise<SmartReport>
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'OK': return 'text-green-600 bg-green-50'
    case 'FAIL': return 'text-red-600 bg-red-50'
    case 'PREFAIL': return 'text-orange-600 bg-orange-50'
    case 'LOGFAIL': return 'text-yellow-600 bg-yellow-50'
    case 'LOGERR': return 'text-yellow-600 bg-yellow-50'
    case 'SELFERR': return 'text-yellow-600 bg-yellow-50'
    default: return 'text-gray-600 bg-gray-50'
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

const getFailureProbabilityColor = (probability?: number) => {
  if (probability === undefined) return 'text-gray-600'
  if (probability < 1) return 'text-green-600'
  if (probability < 5) return 'text-yellow-600'
  if (probability < 10) return 'text-orange-600'
  return 'text-red-600'
}

const DiskCard = ({ disk }: { disk: SmartDiskInfo }) => {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
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
            <div className={`text-2xl font-bold ${
              disk.temperature > 50 ? 'text-red-600' : 
              disk.temperature > 40 ? 'text-orange-600' : 
              'text-green-600'
            }`}>
              {disk.temperature}°C
            </div>
            <div className="text-xs text-gray-500">{m.smart_monitor_temperature()}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        {disk.failureProbability !== undefined && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_failure_probability()}</div>
            <div className={`font-semibold ${getFailureProbabilityColor(disk.failureProbability)}`}>
              {disk.failureProbability.toFixed(2)}%
            </div>
          </div>
        )}
        
        {disk.powerOnHours !== undefined && (
          <div>
            <div className="text-gray-500">{m.smart_monitor_power_on_hours()}</div>
            <div className="font-semibold">
              {disk.powerOnHours.toLocaleString()} {m.smart_monitor_hours()}
              <span className="text-xs text-gray-500 ml-1">
                ({Math.floor(disk.powerOnHours / 24 / 365)} {m.smart_monitor_years()})
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
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {expanded ? '▼' : '▶'} {m.smart_monitor_attributes()} ({disk.attributes.length})
          </button>
          
          {expanded && (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">{m.smart_monitor_id()}</th>
                    <th className="px-2 py-1 text-left">{m.smart_monitor_name()}</th>
                    <th className="px-2 py-1 text-right">{m.smart_monitor_value()}</th>
                    <th className="px-2 py-1 text-right">{m.smart_monitor_worst()}</th>
                    <th className="px-2 py-1 text-right">{m.smart_monitor_threshold()}</th>
                    <th className="px-2 py-1 text-right">{m.smart_monitor_raw()}</th>
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
                      <td className="px-2 py-1 text-right font-mono">{attr.raw}</td>
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

  const criticalDisks = report?.disks.filter(d => 
    d.status === 'FAIL' || d.status === 'PREFAIL' || (d.failureProbability && d.failureProbability > 5)
  ) || []

  const warningDisks = report?.disks.filter(d => 
    !criticalDisks.includes(d) && (
      d.status === 'LOGFAIL' || d.status === 'LOGERR' || d.status === 'SELFERR' ||
      (d.failureProbability && d.failureProbability > 1)
    )
  ) || []

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{m.smart_monitor_title()}</h2>
          {report && (
            <p className="text-sm text-gray-500 mt-1">
              {m.smart_monitor_last_updated()}: {new Date(report.timestamp).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? m.smart_monitor_loading() : m.smart_monitor_refresh()}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          <strong>{m.smart_monitor_error()}:</strong> {error}
        </div>
      )}

      {criticalDisks.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <h3 className="font-semibold text-red-800 mb-2">⚠️ {m.smart_monitor_critical_disks_count({ count: criticalDisks.length })}</h3>
          <p className="text-sm text-red-700">
            {m.smart_monitor_critical_message()}
          </p>
        </div>
      )}

      {warningDisks.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-semibold text-yellow-800 mb-2">⚡ {m.smart_monitor_warning_disks_count({ count: warningDisks.length })}</h3>
          <p className="text-sm text-yellow-700">
            {m.smart_monitor_warning_message()}
          </p>
        </div>
      )}

      {report && report.disks.length > 0 ? (
        <>
          <div className="grid gap-4 mb-4">
            {report.disks.map((disk) => (
              <DiskCard key={disk.name} disk={disk} />
            ))}
          </div>

          <div className="mt-6 border-t pt-4">
            <button
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
      ) : !loading && !error && (
        <div className="text-center py-8 text-gray-500">
          {m.smart_monitor_no_data()}
        </div>
      )}
    </div>
  )
}
