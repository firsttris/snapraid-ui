import { useState } from 'react'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { useFeedback } from './Feedback'
import { UndeleteAdvancedOptions } from './UndeleteAdvancedOptions'
import { UndeleteModeSelector } from './UndeleteModeSelector'
import { UndeletePathInput } from './UndeletePathInput'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface UndeleteDialogProps {
  dataDisk: Record<string, string>
  onExecute: (
    mode: 'all-missing' | 'directory-missing' | 'specific',
    path?: string,
    diskFilter?: string,
  ) => void
  onClose: () => void
}

export const UndeleteDialog = ({
  dataDisk,
  onExecute,
  onClose,
}: UndeleteDialogProps) => {
  const { toast } = useFeedback()
  const [mode, setMode] = useState<
    'all-missing' | 'directory-missing' | 'specific'
  >('specific')
  const [filePath, setFilePath] = useState<string>('')
  const [selectedDisk, setSelectedDisk] = useState<string>(
    Object.keys(dataDisk)[0] || '',
  )
  const [diskFilter, setDiskFilter] = useState<string>()
  const [showBrowser, setShowBrowser] = useState<boolean>(false)

  const handleExecute = () => {
    if (mode === 'all-missing') {
      onExecute('all-missing', undefined, diskFilter)
    } else if (mode === 'directory-missing') {
      if (!filePath.trim()) {
        toast.error(m.undelete_provide_directory())
        return
      }
      const relativePath = getRelativePath(filePath)
      onExecute('directory-missing', relativePath, diskFilter)
    } else {
      if (!filePath.trim()) {
        toast.error(m.undelete_provide_file())
        return
      }
      const relativePath = getRelativePath(filePath)
      onExecute('specific', relativePath, diskFilter)
    }
  }

  const getRelativePath = (absolutePath: string): string => {
    // Ensure trailing slash
    const path = absolutePath.trim().endsWith('/')
      ? absolutePath.trim()
      : `${absolutePath.trim()}/`

    // If already relative (no leading /), return as is
    if (!path.startsWith('/')) {
      return path
    }

    // Try to find which data disk this path belongs to
    for (const [, diskPath] of Object.entries(dataDisk)) {
      if (path.startsWith(diskPath)) {
        // Remove the disk path and leading slash, keep trailing slash
        const relative = path.slice(diskPath.length).replace(/^\//, '')
        return relative || './'
      }
    }

    // If no match, return as is (user might have entered relative path)
    return path
  }

  const handleBrowserSelect = (path: string) => {
    setFilePath(path)
    setShowBrowser(false)
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b p-6 pr-12 pb-4">
            <DialogTitle>{m.undelete_title()}</DialogTitle>
            <DialogDescription>{m.undelete_description()}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <UndeleteModeSelector mode={mode} onChange={setMode} />

            <UndeletePathInput
              mode={mode}
              dataDisk={dataDisk}
              filePath={filePath}
              selectedDisk={selectedDisk}
              onSelectedDiskChange={setSelectedDisk}
              onFilePathChange={setFilePath}
              onBrowse={() => setShowBrowser(true)}
            />

            {/* Advanced Options - for recovery scenarios */}
            <UndeleteAdvancedOptions
              diskFilter={diskFilter}
              onDiskFilterChange={setDiskFilter}
            />
          </div>

          <DialogFooter className="border-t p-6 py-4">
            <Button variant="outline" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button onClick={handleExecute}>{m.undelete_execute()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Directory Browser Overlay */}
      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={
            dataDisk[selectedDisk] || Object.values(dataDisk)[0] || '/'
          }
          title={m.undelete_browse_files()}
        />
      )}
    </>
  )
}
