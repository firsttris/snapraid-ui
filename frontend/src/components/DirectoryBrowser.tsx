import { Folder, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFilesystem } from '../hooks/queries'
import { useDialogKeys } from '../hooks/useDialogKeys'
import * as m from '../paraglide/messages'
import { Button } from './Button'

interface DirectoryBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
  title?: string
  currentValue?: string
}

export const DirectoryBrowser = ({
  onSelect,
  onClose,
  title,
  currentValue,
}: DirectoryBrowserProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeys(dialogRef, onClose)
  const [currentPath, setCurrentPath] = useState<string>(currentValue || '')

  // TanStack Query hook
  const {
    data,
    isLoading: loading,
    error,
  } = useFilesystem(currentPath, 'directories')

  const entries = data?.entries || []
  const actualPath = data?.path || currentPath

  const goUp = () => {
    const parts = actualPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath(`/${parts.join('/')}`)
  }

  const handleSelect = () => {
    onSelect(actualPath)
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
          <h3 className="text-lg font-semibold">{title}</h3>
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
              ↑ {m.common_up()}
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
              {m.directory_browser_no_directories()}
            </div>
          )}

          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                type="button"
                key={entry.path}
                onClick={() => setCurrentPath(entry.path)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-2"
              >
                <Folder size={18} className="shrink-0 text-blue-500" />
                <span className="font-medium">{entry.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {m.common_selected()}:{' '}
            <span className="font-mono">{actualPath || '/'}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button onClick={handleSelect}>{m.common_select()}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
