import type { DuplicateFile } from '@shared/types'
import { X } from 'lucide-react'
import * as m from '../paraglide/messages'
import { Button } from './Button'

interface DupViewerProps {
  duplicates: DuplicateFile[]
  totalSize: number
  isLoading?: boolean
  onClose: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
}

// Largest first, that is where deleting a copy frees the most space
const bySize = (a: DuplicateFile, b: DuplicateFile) => b.size - a.size

export const DupViewer = ({
  duplicates,
  totalSize,
  isLoading,
  onClose,
}: DupViewerProps) => (
  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-4 p-6 border-b">
        <div>
          <h2 className="text-xl font-semibold">{m.dup_title()}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading
              ? m.common_loading()
              : m.dup_summary({
                  count: duplicates.length,
                  size: formatBytes(totalSize),
                })}
          </p>
          <p className="text-xs text-gray-500 mt-1">{m.dup_hint()}</p>
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          size="iconSm"
          aria-label={m.common_close()}
        >
          <X size={20} />
        </Button>
      </div>

      <div className="overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-gray-600 text-center py-8">
            {m.common_loading()}
          </p>
        ) : duplicates.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">
            ✅ {m.dup_none()}
          </p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">
                  {m.filelist_size()}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {m.dup_duplicate()}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {m.dup_same_as()}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[...duplicates].sort(bySize).map((dup) => (
                <tr
                  key={`${dup.disk}:${dup.name}`}
                  className="hover:bg-gray-50 align-top"
                >
                  <td className="px-4 py-2 whitespace-nowrap font-mono text-sm text-right">
                    {formatBytes(dup.size)}
                  </td>
                  <td className="px-4 py-2 font-mono text-sm break-all">
                    <span className="text-purple-600">{dup.disk}: </span>
                    {dup.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-sm text-gray-600 break-all">
                    <span className="text-purple-600">
                      {dup.originalDisk}:{' '}
                    </span>
                    {dup.originalName}
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
