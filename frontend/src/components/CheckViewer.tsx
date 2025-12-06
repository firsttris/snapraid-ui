import type { CheckFileInfo } from '@shared/types'
import * as m from '../paraglide/messages'

interface CheckViewerProps {
  files: CheckFileInfo[]
  totalFiles: number
  errorCount: number
  rehashCount: number
  okCount: number
  isLoading?: boolean
  onClose: () => void
}

export function CheckViewer({ files, totalFiles, errorCount, rehashCount, okCount, isLoading, onClose }: CheckViewerProps) {
  const getStatusColor = (status: CheckFileInfo['status']) => {
    switch (status) {
      case 'OK':
        return 'text-green-600 bg-green-50'
      case 'ERROR':
        return 'text-red-600 bg-red-50'
      case 'REHASH':
        return 'text-yellow-600 bg-yellow-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: CheckFileInfo['status']) => {
    switch (status) {
      case 'OK':
        return '✓'
      case 'ERROR':
        return '✗'
      case 'REHASH':
        return '⟳'
      default:
        return '?'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{m.check_report_title()}</h2>
            {!isLoading && (
              <div className="flex gap-4 mt-2">
                <p className="text-sm text-gray-500">
                  {m.check_report_total()}: <span className="font-semibold">{totalFiles}</span>
                </p>
                {errorCount > 0 && (
                  <p className="text-sm text-red-600">
                    {m.check_report_errors()}: <span className="font-semibold">{errorCount}</span>
                  </p>
                )}
                {rehashCount > 0 && (
                  <p className="text-sm text-yellow-600">
                    {m.check_report_rehash()}: <span className="font-semibold">{rehashCount}</span>
                  </p>
                )}
                {okCount > 0 && (
                  <p className="text-sm text-green-600">
                    {m.check_report_ok()}: <span className="font-semibold">{okCount}</span>
                  </p>
                )}
              </div>
            )}
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

        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          {isLoading ? (
            <p className="text-sm text-gray-600 text-center py-8">{m.common_loading()}</p>
          ) : files.length === 0 && errorCount === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✓</div>
              <p className="text-lg font-semibold text-green-600">{m.check_report_all_success()}</p>
              <p className="text-sm text-gray-500 mt-2">{m.check_report_no_errors()}</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    {m.check_report_status()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {m.check_report_file_path()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">
                    {m.check_report_details()}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {files.map((file, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                        <span className="mr-1">{getStatusIcon(file.status)}</span>
                        {file.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm truncate max-w-[500px]" title={file.name}>
                      {file.name}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {file.error || file.hash || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && errorCount > 0 && (
          <div className="p-4 bg-red-50 border-t border-red-100">
            <p className="text-sm text-red-800">
              <span className="font-semibold">⚠️ {m.check_report_warning_title()}:</span> {m.check_report_warning_message({ count: errorCount, plural: errorCount !== 1 ? 's' : '' })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
