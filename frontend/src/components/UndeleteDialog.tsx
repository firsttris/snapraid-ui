import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'
import { UndeleteModeSelector } from './UndeleteModeSelector'
import { UndeletePathInput } from './UndeletePathInput'
import { UndeleteAdvancedOptions } from './UndeleteAdvancedOptions'
import * as m from '../paraglide/messages'

interface UndeleteDialogProps {
  dataDisk: Record<string, string>
  onExecute: (mode: 'all-missing' | 'directory-missing' | 'specific', path?: string, diskFilter?: string) => void
  onClose: () => void
}

export const UndeleteDialog = ({ dataDisk, onExecute, onClose }: UndeleteDialogProps) => {
  const [mode, setMode] = useState<'all-missing' | 'directory-missing' | 'specific'>('specific')
  const [filePath, setFilePath] = useState<string>('')
  const [selectedDisk, setSelectedDisk] = useState<string>(Object.keys(dataDisk)[0] || '')
  const [diskFilter, setDiskFilter] = useState<string>()
  const [showBrowser, setShowBrowser] = useState<boolean>(false)

  const handleExecute = () => {
    if (mode === 'all-missing') {
      onExecute('all-missing', undefined, diskFilter)
    } else if (mode === 'directory-missing') {
      if (!filePath.trim()) {
        alert(m.undelete_provide_directory())
        return
      }
      const relativePath = getRelativePath(filePath)
      onExecute('directory-missing', relativePath, diskFilter)
    } else {
      if (!filePath.trim()) {
        alert(m.undelete_provide_file())
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
      : absolutePath.trim() + '/'
    
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
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">{m.undelete_title()}</h3>
              <p className="text-sm text-gray-600 mt-1">{m.undelete_description()}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {/* Mode Selection */}
            <UndeleteModeSelector mode={mode} onChange={setMode} />

            {/* File/Directory Path Input */}
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

          {/* Footer */}
          <div className="p-6 border-t flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              {m.common_cancel()}
            </button>
            <button
              onClick={handleExecute}
              className="px-4 py-2 text-white bg-orange-600 rounded hover:bg-orange-700 transition-colors"
            >
              {m.undelete_execute()}
            </button>
          </div>
        </div>
      </div>

      {/* Directory Browser Overlay */}
      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={dataDisk[selectedDisk] || Object.values(dataDisk)[0] || '/'}
          title={m.undelete_browse_files()}
        />
      )}
    </>
  )
}
