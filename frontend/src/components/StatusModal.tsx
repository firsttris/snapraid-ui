import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { SnapRaidStatus } from '@shared/types'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface StatusModalProps {
  status: SnapRaidStatus
  onClose: () => void
  onRefresh?: () => void
}

export function StatusModal({ status, onClose, onRefresh }: StatusModalProps) {
  // Health status color
  const getHealthColor = () => {
    if (status.hasErrors) return 'text-red-600 bg-red-50'
    if (!status.parityUpToDate) return 'text-yellow-600 bg-yellow-50'
    return 'text-green-600 bg-green-50'
  }

  const getHealthIcon = () => {
    if (status.hasErrors) return '❌'
    if (!status.parityUpToDate) return '⚠️'
    return '✅'
  }

  const getHealthText = () => {
    if (status.hasErrors) return 'Errors Detected'
    if (!status.parityUpToDate) return 'Needs Sync'
    return 'Healthy'
  }

  // Scrub status color
  const getScrubColor = () => {
    const percentage = status.scrubPercentage || 0
    if (percentage === 0) return 'text-red-600 bg-red-50'
    if (percentage < 50) return 'text-yellow-600 bg-yellow-50'
    return 'text-green-600 bg-green-50'
  }

  // Prepare chart data
  const chartData = {
    labels: status.scrubHistory?.map(point => `${point.daysAgo}d`) || [],
    datasets: [
      {
        label: 'Scrub Coverage',
        data: status.scrubHistory?.map(point => point.percentage) || [],
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `Coverage: ${context.parsed.y}%`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value: any) => `${value}%`,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        reverse: true, // Most recent on the left
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
    },
  }

  // Format GB values
  const formatGB = (gb?: number) => {
    if (gb === undefined || gb === null) return '-'
    return `${gb.toFixed(1)} GB`
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold">SnapRAID Status</h3>
            <p className="text-sm text-gray-600 mt-1">Array health and disk information</p>
          </div>
          <div className="flex gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Refresh status"
              >
                🔄 Refresh
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Status Cards Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Health Card */}
            <div className={`p-4 rounded-lg border-2 ${getHealthColor()}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium opacity-80">Array Health</span>
                <span className="text-2xl">{getHealthIcon()}</span>
              </div>
              <div className="text-2xl font-bold">{getHealthText()}</div>
              {!status.parityUpToDate && (
                <div className="text-xs mt-1 opacity-70">Sync required</div>
              )}
            </div>

            {/* Scrub Card */}
            <div className={`p-4 rounded-lg border-2 ${getScrubColor()}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium opacity-80">Scrub Status</span>
                <span className="text-2xl">🔍</span>
              </div>
              <div className="text-2xl font-bold">
                {status.scrubPercentage !== undefined ? `${status.scrubPercentage}%` : '-'}
              </div>
              <div className="text-xs mt-1 opacity-70">
                {status.oldestScrubDays !== undefined 
                  ? `Oldest: ${status.oldestScrubDays}d ago`
                  : 'No data'}
              </div>
            </div>

            {/* Sync Card */}
            <div className={`p-4 rounded-lg border-2 ${status.syncInProgress ? 'text-blue-600 bg-blue-50' : 'text-green-600 bg-green-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium opacity-80">Sync Status</span>
                <span className="text-2xl">{status.syncInProgress ? '⏳' : '✅'}</span>
              </div>
              <div className="text-2xl font-bold">
                {status.syncInProgress ? 'In Progress' : 'Complete'}
              </div>
              {!status.syncInProgress && (
                <div className="text-xs mt-1 opacity-70">Up to date</div>
              )}
            </div>
          </div>

          {/* Disk Cards */}
          {status.disks && status.disks.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold mb-3">Data Disks ({status.disks.length})</h4>
              <div className="grid grid-cols-2 gap-4">
                {status.disks.map((disk, idx) => (
                  <div key={idx} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-semibold text-lg">{disk.name}</h5>
                        <p className="text-sm text-gray-600">{disk.files.toLocaleString()} files</p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${disk.usePercent > 80 ? 'text-red-600' : disk.usePercent > 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {disk.usePercent}%
                        </div>
                        <p className="text-xs text-gray-500">Usage</p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${disk.usePercent > 80 ? 'bg-red-500' : disk.usePercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${disk.usePercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Used:</span>
                        <span className="ml-1 font-medium">{formatGB(disk.usedGB)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Free:</span>
                        <span className="ml-1 font-medium">{formatGB(disk.freeGB)}</span>
                      </div>
                      {disk.fragmentedFiles > 0 && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Fragmented:</span>
                          <span className="ml-1 font-medium text-orange-600">{disk.fragmentedFiles} files</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals Summary */}
          {(status.totalFiles !== undefined || status.totalUsedGB !== undefined) && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold mb-2 text-blue-900">Total Array Summary</h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Files:</span>
                  <span className="ml-1 font-semibold text-blue-900">
                    {status.totalFiles?.toLocaleString() || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Used:</span>
                  <span className="ml-1 font-semibold text-blue-900">
                    {formatGB(status.totalUsedGB)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Free:</span>
                  <span className="ml-1 font-semibold text-blue-900">
                    {formatGB(status.totalFreeGB)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Fragmented:</span>
                  <span className="ml-1 font-semibold text-blue-900">
                    {status.fragmentedFiles || 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Scrub History Chart */}
          {status.scrubHistory && status.scrubHistory.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold mb-3">Scrub History</h4>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="h-64">
                  <Line data={chartData} options={chartOptions} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-center">
                  <div>
                    <span className="text-gray-600">Oldest:</span>
                    <span className="ml-1 font-semibold">{status.oldestScrubDays || 0} days</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Median:</span>
                    <span className="ml-1 font-semibold">{status.medianScrubDays || 0} days</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Newest:</span>
                    <span className="ml-1 font-semibold">{status.newestScrubDays || 0} days</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status Messages */}
          <div className="space-y-2">
            {status.syncInProgress && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                ℹ️ A sync operation is currently in progress
              </div>
            )}
            {!status.parityUpToDate && !status.syncInProgress && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                ⚠️ Parity is not up to date. Run sync to update.
              </div>
            )}
            {status.hasErrors && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                ❌ Errors detected in the array. Check logs for details.
              </div>
            )}
            {!status.hasErrors && status.parityUpToDate && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                ✅ No errors detected. Array is healthy.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
