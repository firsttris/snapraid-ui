import { useState } from 'react'
import type { ProbeReport, DiskPowerStatus } from '@shared/types'

interface DiskPowerControlProps {
  configPath: string
  onProbe: () => Promise<ProbeReport>
  onSpinUp: (disks?: string[]) => Promise<{ success: boolean; message: string; output: string }>
  onSpinDown: (disks?: string[]) => Promise<{ success: boolean; message: string; output: string }>
}

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
      return '🟢'
    case 'standby':
      return '⚫'
    case 'idle':
      return '🟡'
    default:
      return '⚪'
  }
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
      return 'text-green-600 bg-green-50'
    case 'standby':
      return 'text-gray-600 bg-gray-50'
    case 'idle':
      return 'text-yellow-600 bg-yellow-50'
    default:
      return 'text-gray-400 bg-gray-50'
  }
}

const DiskPowerCard = ({ 
  disk, 
  selected, 
  onToggleSelect 
}: { 
  disk: DiskPowerStatus
  selected: boolean
  onToggleSelect: (name: string) => void
}) => {
  return (
    <div 
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={() => onToggleSelect(disk.name)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(disk.name)}
            className="w-4 h-4"
            onClick={(e) => e.stopPropagation()}
          />
          <div>
            <h3 className="font-semibold">{disk.name}</h3>
            <p className="text-sm text-gray-600">{disk.device}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getStatusIcon(disk.status)}</span>
          <span className={`px-3 py-1 rounded font-semibold ${getStatusColor(disk.status)}`}>
            {disk.status}
          </span>
        </div>
      </div>
    </div>
  )
}

export const DiskPowerControl = ({ 
  onProbe, 
  onSpinUp, 
  onSpinDown 
}: DiskPowerControlProps) => {
  const [report, setReport] = useState<ProbeReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedDisks, setSelectedDisks] = useState<Set<string>>(new Set())
  const [showRawOutput, setShowRawOutput] = useState(false)
  const [isUnsupported, setIsUnsupported] = useState(false)

  const handleProbe = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setIsUnsupported(false)
    try {
      const data = await onProbe()
      setReport(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      
      // Check if it's an unsupported platform error
      if (errorMessage.includes('unsupported') || errorMessage.includes('not supported')) {
        setIsUnsupported(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSpinUp = async () => {
    setOperating(true)
    setError(null)
    setSuccess(null)
    try {
      const disksArray = selectedDisks.size > 0 ? Array.from(selectedDisks) : undefined
      const result = await onSpinUp(disksArray)
      setSuccess(result.message)
      // Refresh status after operation
      setTimeout(() => handleProbe(), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperating(false)
    }
  }

  const handleSpinDown = async () => {
    setOperating(true)
    setError(null)
    setSuccess(null)
    try {
      const disksArray = selectedDisks.size > 0 ? Array.from(selectedDisks) : undefined
      const result = await onSpinDown(disksArray)
      setSuccess(result.message)
      // Refresh status after operation
      setTimeout(() => handleProbe(), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperating(false)
    }
  }

  const toggleDiskSelection = (name: string) => {
    const newSelection = new Set(selectedDisks)
    if (newSelection.has(name)) {
      newSelection.delete(name)
    } else {
      newSelection.add(name)
    }
    setSelectedDisks(newSelection)
  }

  const selectAll = () => {
    if (report) {
      setSelectedDisks(new Set(report.disks.map(d => d.name)))
    }
  }

  const selectNone = () => {
    setSelectedDisks(new Set())
  }

  const activeCount = report?.disks.filter(d => d.status.toLowerCase() === 'active').length || 0
  const standbyCount = report?.disks.filter(d => d.status.toLowerCase() === 'standby').length || 0

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Disk Power Management</h2>
          {report && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(report.timestamp).toLocaleString()}
              {' • '}
              <span className="text-green-600">{activeCount} Active</span>
              {' • '}
              <span className="text-gray-600">{standbyCount} Standby</span>
            </p>
          )}
        </div>
        <button
          onClick={handleProbe}
          disabled={loading || operating}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Probing...' : 'Probe Disk Status'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          <strong>Error:</strong> {error}
          {isUnsupported && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-yellow-800 text-sm">
              <strong>ℹ️ Note:</strong> The <code className="bg-yellow-100 px-1 rounded">probe</code> command is not supported on your platform. 
              This is common with NVMe drives or certain disk controllers. You can still use the <strong>Spin Up</strong> and <strong>Spin Down</strong> commands 
              directly without probing the current status first.
            </div>
          )}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-700">
          <strong>Success:</strong> {success}
        </div>
      )}

      {report && report.disks.length > 0 ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              >
                Select All
              </button>
              <button
                onClick={selectNone}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              >
                Select None
              </button>
            </div>
            <div className="text-sm text-gray-600">
              {selectedDisks.size > 0 ? (
                <span>{selectedDisks.size} disk{selectedDisks.size > 1 ? 's' : ''} selected</span>
              ) : (
                <span>No disks selected (operations will affect all disks)</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 mb-6">
            {report.disks.map((disk) => (
              <DiskPowerCard
                key={disk.name}
                disk={disk}
                selected={selectedDisks.has(disk.name)}
                onToggleSelect={toggleDiskSelection}
              />
            ))}
          </div>

          <div className="flex gap-3 mb-4">
            <button
              onClick={handleSpinUp}
              disabled={operating || loading}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {operating ? 'Operating...' : `🔄 Spin Up ${selectedDisks.size > 0 ? `(${selectedDisks.size})` : 'All'}`}
            </button>
            <button
              onClick={handleSpinDown}
              disabled={operating || loading}
              className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {operating ? 'Operating...' : `⏸️ Spin Down ${selectedDisks.size > 0 ? `(${selectedDisks.size})` : 'All'}`}
            </button>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>⚠️ Warning:</strong> Spinning up all disks at once requires significant power. 
            Ensure your power supply can handle the load. Spinning down disks will put them in standby mode 
            to save power and reduce wear.
          </div>

          <div className="mt-6 border-t pt-4">
            <button
              onClick={() => setShowRawOutput(!showRawOutput)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              {showRawOutput ? '▼' : '▶'} Show Raw Output
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
          Click "Probe Disk Status" to check the power state of all disks
        </div>
      )}

      {/* Allow spin up/down even when probe is unsupported */}
      {isUnsupported && (
        <>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded mb-4">
            <h3 className="font-semibold text-blue-900 mb-2">Direct Disk Control</h3>
            <p className="text-sm text-blue-800 mb-3">
              Since probe is not available, you can still control all disks directly using the buttons below.
            </p>
          </div>

          <div className="flex gap-3 mb-4">
            <button
              onClick={handleSpinUp}
              disabled={operating || loading}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {operating ? 'Operating...' : '🔄 Spin Up All Disks'}
            </button>
            <button
              onClick={handleSpinDown}
              disabled={operating || loading}
              className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {operating ? 'Operating...' : '⏸️ Spin Down All Disks'}
            </button>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>⚠️ Warning:</strong> Spinning up all disks at once requires significant power. 
            Ensure your power supply can handle the load. Spinning down disks will put them in standby mode 
            to save power and reduce wear.
          </div>
        </>
      )}
    </div>
  )
}
