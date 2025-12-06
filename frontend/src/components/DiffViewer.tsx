import type { DiffFileInfo } from '@shared/types'
import * as m from '../paraglide/messages'

interface DiffViewerProps {
  files: DiffFileInfo[]
  totalFiles: number
  equalFiles: number
  newFiles: number
  modifiedFiles: number
  deletedFiles: number
  movedFiles: number
  copiedFiles: number
  restoredFiles: number
  isLoading?: boolean
  onClose: () => void
}

export function DiffViewer({ 
  files, 
  totalFiles, 
  equalFiles,
  newFiles,
  modifiedFiles,
  deletedFiles,
  movedFiles,
  copiedFiles,
  restoredFiles,
  isLoading, 
  onClose 
}: DiffViewerProps) {
  const getStatusColor = (status: DiffFileInfo['status']) => {
    switch (status) {
      case 'equal':
        return 'text-green-600 bg-green-50'
      case 'added':
        return 'text-blue-600 bg-blue-50'
      case 'removed':
        return 'text-red-600 bg-red-50'
      case 'updated':
        return 'text-orange-600 bg-orange-50'
      case 'moved':
        return 'text-purple-600 bg-purple-50'
      case 'copied':
        return 'text-cyan-600 bg-cyan-50'
      case 'restored':
        return 'text-green-600 bg-green-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: DiffFileInfo['status']) => {
    switch (status) {
      case 'equal':
        return '✓'
      case 'added':
        return '➕'
      case 'removed':
        return '🗑️'
      case 'updated':
        return '📝'
      case 'moved':
        return '↔️'
      case 'copied':
        return '📋'
      case 'restored':
        return '♻️'
      default:
        return '?'
    }
  }

  const totalChanges = newFiles + modifiedFiles + deletedFiles + movedFiles + copiedFiles + restoredFiles
  const hasChanges = totalChanges > 0

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{m.diff_report_title()}</h2>
            {!isLoading && (
              <div className="flex gap-4 mt-2 flex-wrap">
                <p className="text-sm text-gray-500">
                  {m.diff_report_total()}: <span className="font-semibold">{totalFiles}</span>
                </p>
                {equalFiles > 0 && (
                  <p className="text-sm text-green-600">
                    {m.diff_report_equal()}: <span className="font-semibold">{equalFiles}</span>
                  </p>
                )}
                {newFiles > 0 && (
                  <p className="text-sm text-blue-600">
                    {m.diff_report_new()}: <span className="font-semibold">{newFiles}</span>
                  </p>
                )}
                {modifiedFiles > 0 && (
                  <p className="text-sm text-orange-600">
                    {m.diff_report_modified()}: <span className="font-semibold">{modifiedFiles}</span>
                  </p>
                )}
                {deletedFiles > 0 && (
                  <p className="text-sm text-red-600">
                    {m.diff_report_deleted()}: <span className="font-semibold">{deletedFiles}</span>
                  </p>
                )}
                {movedFiles > 0 && (
                  <p className="text-sm text-purple-600">
                    {m.diff_report_moved()}: <span className="font-semibold">{movedFiles}</span>
                  </p>
                )}
                {copiedFiles > 0 && (
                  <p className="text-sm text-cyan-600">
                    {m.diff_report_copied()}: <span className="font-semibold">{copiedFiles}</span>
                  </p>
                )}
                {restoredFiles > 0 && (
                  <p className="text-sm text-green-600">
                    {m.diff_report_restored()}: <span className="font-semibold">{restoredFiles}</span>
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
          ) : !hasChanges && files.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✓</div>
              <p className="text-lg font-semibold text-green-600">{m.diff_report_all_sync()}</p>
              <p className="text-sm text-gray-500 mt-2">{m.diff_report_no_changes()}</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                    {m.diff_report_status()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {m.diff_report_file_path()}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">
                    {m.diff_report_size()}
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
                      {file.size || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && hasChanges && (
          <div className="p-4 bg-orange-50 border-t border-orange-100">
            <p className="text-sm text-orange-800">
              <span className="font-semibold">⚠️ {m.diff_report_changes_detected()}:</span> {m.diff_report_changes_message({ count: totalChanges, plural: totalChanges !== 1 ? 's' : '', singular: totalChanges === 1 ? 's' : '' })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
