import type { DiffReport } from '@shared/types'
import { useEffect, useState } from 'react'
import { getDiff } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'

// How many deleted files are listed before collapsing into "… and N more"
const MAX_DELETED_SHOWN = 20

interface SyncPreviewDialogProps {
  configPath: string
  // An interrupted sync already recorded the file list, so diff looks clean
  // while parity still lags behind
  hasUnsyncedParity: boolean
  onConfirm: () => void
  onClose: () => void
}

export const SyncPreviewDialog = ({
  configPath,
  hasUnsyncedParity,
  onConfirm,
  onClose,
}: SyncPreviewDialogProps) => {
  const [diff, setDiff] = useState<DiffReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDiff(configPath)
      .then((data) => {
        if (!cancelled) setDiff(data)
      })
      .catch((err) => {
        if (!cancelled)
          setError(String(err instanceof Error ? err.message : err))
      })
    return () => {
      cancelled = true
    }
  }, [configPath])

  const isLoading = !diff && !error
  const changes = diff
    ? [
        {
          label: m.diff_report_new(),
          count: diff.newFiles,
          color: 'text-blue-600',
        },
        {
          label: m.diff_report_modified(),
          count: diff.modifiedFiles,
          color: 'text-orange-600',
        },
        {
          label: m.diff_report_moved(),
          count: diff.movedFiles,
          color: 'text-purple-600',
        },
        {
          label: m.diff_report_copied(),
          count: diff.copiedFiles,
          color: 'text-cyan-600',
        },
        {
          label: m.diff_report_restored(),
          count: diff.restoredFiles,
          color: 'text-green-600',
        },
        {
          label: m.diff_report_deleted(),
          count: diff.deletedFiles,
          color: 'text-red-600',
        },
      ].filter((change) => change.count > 0)
    : []
  const deletedFiles =
    diff?.files.filter((file) => file.status === 'removed') ?? []

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">{m.sync_preview_title()}</h2>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {isLoading && (
            <div className="flex items-center gap-3 text-gray-600">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              {m.sync_preview_loading()}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {m.sync_preview_error({ error })}
            </div>
          )}

          {hasUnsyncedParity && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              ⚠️ {m.sync_preview_unfinished()}
            </div>
          )}

          {diff && changes.length === 0 && !hasUnsyncedParity && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              ✅ {m.sync_preview_no_changes()}
            </div>
          )}

          {changes.length > 0 && (
            <>
              <p className="text-gray-700">{m.sync_preview_intro()}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {changes.map((change) => (
                  <div
                    key={change.label}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className={`text-2xl font-bold ${change.color}`}>
                      {change.count}
                    </p>
                    <p className="text-sm text-gray-600">{change.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {diff && diff.deletedFiles > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">
                ⚠️ {m.sync_preview_deleted_warning({ count: diff.deletedFiles })}
              </p>
              <p className="mt-1">{m.sync_preview_deleted_hint()}</p>
              {deletedFiles.length > 0 && (
                <ul className="mt-3 max-h-48 overflow-y-auto rounded bg-white/60 p-2 font-mono text-xs">
                  {deletedFiles.slice(0, MAX_DELETED_SHOWN).map((file) => (
                    <li
                      key={`${file.disk}:${file.name}`}
                      className="truncate"
                      title={file.name}
                    >
                      {file.disk && (
                        <span className="text-red-500">{file.disk}: </span>
                      )}
                      {file.name}
                    </li>
                  ))}
                  {deletedFiles.length > MAX_DELETED_SHOWN && (
                    <li className="italic">
                      {m.sync_preview_more({
                        count: deletedFiles.length - MAX_DELETED_SHOWN,
                      })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {m.sync_preview_cancel()}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded text-white disabled:bg-gray-300 disabled:cursor-not-allowed ${
              error || (diff && diff.deletedFiles > 0)
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {error ? m.sync_preview_start_anyway() : m.sync_preview_start()}
          </button>
        </div>
      </div>
    </div>
  )
}
