import type { DeviceInfo } from '@shared/types'
import * as m from '../paraglide/messages'

interface DeviceListProps {
  devices: DeviceInfo[]
  isLoading?: boolean
  onClose: () => void
}

export function DeviceList({ devices, isLoading, onClose }: DeviceListProps) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{m.devices_title()}</h2>
            <p className="text-sm text-gray-500 mt-1">{m.devices_description()}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {isLoading ? (
            <p className="text-sm text-gray-600 text-center py-8">{m.common_loading()}</p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">{m.devices_no_devices()}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {m.devices_disk_name()}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {m.devices_device()}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {m.devices_partition()}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {m.devices_major_minor()}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {devices.map((device, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          device.diskName.includes('parity') 
                            ? 'text-red-600 bg-red-50' 
                            : 'text-blue-600 bg-blue-50'
                        }`}>
                          {device.diskName}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-sm">
                        {device.device}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-sm">
                        {device.partition}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500">
                        {device.majorMinor} → {device.partMajorMinor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
