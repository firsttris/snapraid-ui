import type { ParsedSnapRaidConfig } from '@shared/types'
import * as m from '../paraglide/messages'

interface DashboardCardsProps {
  parsedConfig: ParsedSnapRaidConfig | undefined
}

export const DashboardCards = ({ parsedConfig }: DashboardCardsProps) => {
  if (!parsedConfig) return null

  const dataDiskCount = Object.keys(parsedConfig.data).length
  const parityDiskCount = parsedConfig.parity.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
              <div className="text-gray-60 truncate" title={path}>{path}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
