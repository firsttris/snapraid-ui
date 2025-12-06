import type { ParsedSnapRaidConfig, SnapRaidStatus } from '@shared/types'

interface DashboardCardsProps {
  parsedConfig: ParsedSnapRaidConfig | undefined
  status: SnapRaidStatus | null
}

export const DashboardCards = ({ parsedConfig, status }: DashboardCardsProps) => {
  if (!parsedConfig) return null

  // Berechneter Wert direkt im Render - kein State nötig
  const dataDiskCount = Object.keys(parsedConfig.data).length
  const parityDiskCount = parsedConfig.parity.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Data Disks */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Data Disks</h3>
        <p className="text-3xl font-bold text-blue-600">{dataDiskCount}</p>
        <div className="mt-4 space-y-1">
          {Object.entries(parsedConfig.data).map(([name, path]) => (
            <div key={name} className="text-sm text-gray-600">
              <span className="font-medium">{name}:</span> {path}
            </div>
          ))}
        </div>
      </div>

      {/* Parity Disks */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Parity Disks</h3>
        <p className="text-3xl font-bold text-purple-600">{parityDiskCount}</p>
        <div className="mt-4 space-y-1">
          {parsedConfig.parity.map((path, index) => (
            <div key={index} className="text-sm text-gray-600">
              {path}
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Status</h3>
        {status ? (
          <>
            <div className={`text-sm font-medium mb-2 ${status.parityUpToDate ? 'text-green-600' : 'text-yellow-600'}`}>
              {status.parityUpToDate ? '✓ Parity Up-to-date' : '⚠ Parity Outdated'}
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <div>New files: <span className="font-medium">{status.newFiles}</span></div>
              <div>Modified: <span className="font-medium">{status.modifiedFiles}</span></div>
              <div>Deleted: <span className="font-medium">{status.deletedFiles}</span></div>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-sm">Run 'status' to see details</p>
        )}
      </div>
    </div>
  )
}
