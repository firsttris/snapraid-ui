import { ArrowUp, Folder, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useFilesystem } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b bg-muted/50 px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={goUp}
            disabled={actualPath === '/'}
          >
            <ArrowUp />
            {m.common_up()}
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
              {m.directory_browser_no_directories()}
            </div>
          )}

          <div className="space-y-0.5">
            {entries.map((entry) => (
              <button
                type="button"
                key={entry.path}
                onClick={() => setCurrentPath(entry.path)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Folder className="size-4 shrink-0 text-blue-600" />
                <span className="truncate font-medium">{entry.name}</span>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-3 sm:items-center border-t bg-muted/50 px-6 py-4 sm:justify-between">
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            {m.common_selected()}:{' '}
            <span className="font-mono text-foreground">
              {actualPath || '/'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button onClick={handleSelect}>{m.common_select()}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
