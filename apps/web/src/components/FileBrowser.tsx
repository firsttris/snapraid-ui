import { ArrowUp, FileText, Folder, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useFilesystem } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface FileBrowserProps {
  onSelect: (path: string) => void
  onClose: () => void
}

export const FileBrowser = ({ onSelect, onClose }: FileBrowserProps) => {
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{m.config_manager_select_file()}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b bg-muted/50 px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goUp}
            disabled={actualPath === '/'}
          >
            <ArrowUp />
            {m.directory_browser_up()}
          </Button>
          <div className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
            {actualPath || '/'}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="sr-only">{m.common_loading()}</span>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{String(error)}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {m.config_manager_no_files_found()}
            </div>
          )}

          <div className="space-y-0.5">
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
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {entry.isDirectory ? (
                  <Folder className="size-4 shrink-0 text-blue-600" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={
                    entry.isDirectory ? 'truncate font-medium' : 'truncate'
                  }
                >
                  {entry.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
