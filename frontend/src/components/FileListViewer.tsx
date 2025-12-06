import type { SnapRaidFileInfo } from '@shared/types'
import * as m from '../paraglide/messages'

interface FileListViewerProps {
  files: SnapRaidFileInfo[]
  totalFiles: number
  totalSize: number
  totalLinks: number
  isLoading?: boolean
  onClose: () => void
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export function FileListViewer({ files, totalFiles, totalSize, totalLinks, isLoading, onClose }: FileListViewerProps) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{m.filelist_title()}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {isLoading ? m.common_loading() : m.filelist_summary({ files: totalFiles, size: formatBytes(totalSize), links: totalLinks })}
            </p>
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
          ) : files.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">{m.filelist_no_files()}</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                    {m.filelist_size()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    {m.filelist_date()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">
                    {m.filelist_time()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {m.filelist_name()}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {files.map((file, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-sm text-right">
                      {formatBytes(file.size)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-sm">
                      {file.date}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-sm">
                      {file.time}
                    </td>
                    <td className="px-4 py-2 font-mono text-sm truncate max-w-[500px]" title={file.name}>
                      {file.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
