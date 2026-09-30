import { FileText, Folder, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFilesystem } from '../hooks/queries'
import { useDialogKeys } from '../hooks/useDialogKeys'
import * as m from '../paraglide/messages'

interface FileBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
}

export const FileBrowser = ({ onSelect, onClose }: FileBrowserProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeys(dialogRef, onClose)
  const [currentPath, setCurrentPath] = useState<string>('')

  const { data, isLoading: loading, error } = useFilesystem(currentPath, 'conf')

  const entries = data?.entries || []
  const actualPath = data?.path || currentPath

  const goUp = () => {
    const parts = actualPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath(`/${parts.join('/')}`)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut, Escape closes too
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col outline-none"
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">
            {m.config_manager_select_file()}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label={m.common_close()}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goUp}
              disabled={actualPath === '/'}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ↑ {m.directory_browser_up()}
            </button>
            <div className="flex-1 text-sm text-gray-600 font-mono">
              {actualPath || '/'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center text-gray-500">
              {m.common_loading()}
            </div>
          )}
          {error && <div className="text-red-600 text-sm">{String(error)}</div>}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center text-gray-500">
              {m.config_manager_no_files_found()}
            </div>
          )}

          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                type="button"
                key={entry.path}
                onClick={() => {
                  if (entry.isDirectory) {
                    setCurrentPath(entry.path)
                  } else {
                    onSelect(entry.path)
                  }
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-2"
              >
                {entry.isDirectory ? (
                  <Folder size={18} className="shrink-0 text-blue-500" />
                ) : (
                  <FileText size={18} className="shrink-0 text-gray-500" />
                )}
                <span className={entry.isDirectory ? 'font-medium' : ''}>
                  {entry.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
