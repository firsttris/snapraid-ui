import { useState } from 'react'
import { DirectoryBrowser } from './DirectoryBrowser'
import * as m from '../paraglide/messages'

interface UndeleteDialogProps {
  dataDisk: Record<string, string>
  onExecute: (mode: 'all-missing' | 'directory-missing' | 'specific', path?: string) => void
  onClose: () => void
}

export const UndeleteDialog = ({ dataDisk, onExecute, onClose }: UndeleteDialogProps) => {
  const [mode, setMode] = useState<'all-missing' | 'directory-missing' | 'specific'>('specific')
  const [filePath, setFilePath] = useState<string>('')
  const [selectedDisk, setSelectedDisk] = useState<string>(Object.keys(dataDisk)[0] || '')
  const [showBrowser, setShowBrowser] = useState<boolean>(false)

  const handleExecute = () => {
    if (mode === 'all-missing') {
      onExecute('all-missing')
    } else if (mode === 'directory-missing') {
      if (!filePath.trim()) {
        alert('Please provide a directory path')
        return
      }
      const relativePath = getRelativePath(filePath)
      onExecute('directory-missing', relativePath)
    } else {
      if (!filePath.trim()) {
        alert('Please provide a file or directory path')
        return
      }
      const relativePath = getRelativePath(filePath)
      onExecute('specific', relativePath)
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
    for (const [diskName, diskPath] of Object.entries(dataDisk)) {
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {m.undelete_mode_label()}
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="mode"
                    value="all-missing"
                    checked={mode === 'all-missing'}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium">{m.undelete_all_missing()}</div>
                    <div className="text-sm text-gray-600">snapraid fix -m</div>
                  </div>
                </label>

                <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="mode"
                    value="directory-missing"
                    checked={mode === 'directory-missing'}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium">{m.undelete_directory_missing()}</div>
                    <div className="text-sm text-gray-600">snapraid fix -m -f DIR/</div>
                  </div>
                </label>

                <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="mode"
                    value="specific"
                    checked={mode === 'specific'}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium">{m.undelete_specific_file()}</div>
                    <div className="text-sm text-gray-600">snapraid fix -f FILE</div>
                  </div>
                </label>
              </div>
            </div>

            {/* File/Directory Path Input */}
            {(mode === 'directory-missing' || mode === 'specific') && (
              <div className="space-y-4">
                {/* Data Disk Selector */}
                {Object.keys(dataDisk).length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Disk
                    </label>
                    <select
                      value={selectedDisk}
                      onChange={(e) => setSelectedDisk(e.target.value)}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(dataDisk).map(([name, path]) => (
                        <option key={name} value={name}>
                          {name} ({path})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {m.undelete_file_path_label()}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={filePath}
                      onChange={(e) => setFilePath(e.target.value)}
                      placeholder={m.undelete_file_path_placeholder()}
                      className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setShowBrowser(true)}
                      disabled={!selectedDisk}
                      className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {m.undelete_browse_files()}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {mode === 'directory-missing' 
                      ? 'Enter path relative to data disk (e.g., Movies/deleted_folder/)' 
                      : 'Enter path relative to data disk (e.g., Documents/file.txt or browse absolute path)'}
                  </p>
                  {selectedDisk && dataDisk[selectedDisk] && (
                    <p className="mt-1 text-xs text-gray-400">
                      Base: {dataDisk[selectedDisk]}
                    </p>
                  )}
                </div>
              </div>
            )}
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
      {showBrowser && selectedDisk && dataDisk[selectedDisk] && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={dataDisk[selectedDisk]}
          title={`Browse ${selectedDisk}`}
        />
      )}
    </>
  )
}
