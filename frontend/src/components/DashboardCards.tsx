import type { ParsedSnapRaidConfig, SnapRaidStatus } from '@shared/types'
import * as m from '../paraglide/messages'

interface DashboardCardsProps {
  parsedConfig: ParsedSnapRaidConfig | undefined
  status: SnapRaidStatus | null
}

export const DashboardCards = ({ parsedConfig, status }: DashboardCardsProps) => {
  if (!parsedConfig) return null

  const dataDiskCount = Object.keys(parsedConfig.data).length
  const parityDiskCount = parsedConfig.parity.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Data Disks */}
      <div className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-700">{m.dashboard_data_disks()}</h3>
          <span className="text-4xl">💾</span>
        </div>
        <p className="text-4xl font-bold text-blue-600 mb-4">{dataDiskCount}</p>
        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
          {Object.entries(parsedConfig.data).map(([name, path]) => (
            <div key={name} className="text-sm bg-gray-50 rounded p-2 border border-gray-100">
              <span className="font-semibold text-blue-600">{name}</span>
              <div className="text-gray-600 truncate" title={path}>{path}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Parity Disks */}
      <div className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-700">{m.dashboard_parity_disks()}</h3>
          <span className="text-4xl">🛡️</span>
        </div>
        <p className="text-4xl font-bold text-purple-600 mb-4">{parityDiskCount}</p>
        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
          {parsedConfig.parity.map((path, index) => (
            <div key={index} className="text-sm bg-gray-50 rounded p-2 border border-gray-100">
              <span className="font-semibold text-purple-600">Parity {index + 1}</span>
              <div className="text-gray-600 truncate" title={path}>{path}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-700">{m.dashboard_status()}</h3>
          <span className="text-4xl">
            {status ? (status.parityUpToDate ? '✅' : '❓') : '❓'}
          </span>
        </div>
        {status ? (
          <>
            <div className={`text-lg font-semibold mb-4 px-3 py-2 rounded ${
              status.parityUpToDate
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {status.parityUpToDate 
                ? `✓ ${m.dashboard_parity_up_to_date()}` 
                : `❓ ${m.dashboard_status()}`}
            </div>
            
            <div className="space-y-3">
              {/* Scrub info */}
              {status.scrubPercentage !== undefined && (
                <div className="flex items-center justify-between p-2 rounded bg-purple-50 border border-purple-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔍</span>
                    <span className="text-sm font-medium text-gray-700">Scrubbed</span>
                  </div>
                  <span className="font-bold text-lg text-purple-600">
                    {status.scrubPercentage}%
                  </span>
                </div>
              )}

              {status.oldestScrubDays !== undefined && (
                <div className="flex items-center justify-between p-2 rounded bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📅</span>
                    <span className="text-sm font-medium text-gray-700">Oldest Scrub</span>
                  </div>
                  <span className="font-bold text-lg text-gray-600">
                    {status.oldestScrubDays}d
                  </span>
                </div>
              )}

              {status.fragmentedFiles !== undefined && status.fragmentedFiles > 0 && (
                <div className="flex items-center justify-between p-2 rounded bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    <span className="text-sm font-medium text-gray-700">Fragmented</span>
                  </div>
                  <span className="font-bold text-lg text-yellow-600">
                    {status.fragmentedFiles}
                  </span>
                </div>
              )}

              {status.wastedGB !== undefined && status.wastedGB > 0 && (
                <div className="flex items-center justify-between p-2 rounded bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💾</span>
                    <span className="text-sm font-medium text-gray-700">Wasted Space</span>
                  </div>
                  <span className="font-bold text-lg text-red-600">
                    {status.wastedGB.toFixed(2)} GB
                  </span>
                </div>
              )}

              {status.freeSpaceGB !== undefined && (
                <div className="flex items-center justify-between p-2 rounded bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📀</span>
                    <span className="text-sm font-medium text-gray-700">Free Space</span>
                  </div>
                  <span className="font-bold text-lg text-blue-600">
                    {status.freeSpaceGB.toFixed(0)} GB
                  </span>
                </div>
              )}

              {/* Errors indicator */}
              <div className={`flex items-center justify-between p-2 rounded ${
                status.hasErrors ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{status.hasErrors ? '⚠️' : '✅'}</span>
                  <span className="text-sm font-medium text-gray-700">Health</span>
                </div>
                <span className={`font-bold text-sm ${
                  status.hasErrors ? 'text-red-600' : 'text-green-600'
                }`}>
                  {status.hasErrors ? 'Issues Found' : 'No Errors'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-5xl mb-3">📊</span>
            <p className="text-gray-500 text-sm text-center">{m.dashboard_run_status()}</p>
            <div className="mt-4 text-xs text-gray-400 text-center">
              Click <span className="font-semibold">Status</span> or <span className="font-semibold">Diff</span> to see details
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
