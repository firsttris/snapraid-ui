import * as m from '../paraglide/messages'

type UndeleteMode = 'all-missing' | 'directory-missing' | 'specific'

interface UndeletePathInputProps {
  mode: UndeleteMode
  dataDisk: Record<string, string>
  filePath: string
  selectedDisk: string
  onSelectedDiskChange: (disk: string) => void
  onFilePathChange: (path: string) => void
  onBrowse: () => void
}

export const UndeletePathInput = ({ 
  mode, 
  dataDisk, 
  filePath,
  selectedDisk,
  onSelectedDiskChange,
  onFilePathChange,
  onBrowse 
}: UndeletePathInputProps) => {

  if (mode === 'all-missing') {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Data Disk Selector - for browsing */}
      {Object.keys(dataDisk).length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {m.undelete_browse_from_disk()}
          </label>
          <select
            value={selectedDisk}
            onChange={(e) => onSelectedDiskChange(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(dataDisk).map(([name, path]) => (
              <option key={name} value={name}>
                {name} ({path})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {m.undelete_select_disk_help()}
          </p>
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
            onChange={(e) => onFilePathChange(e.target.value)}
            placeholder={m.undelete_file_path_placeholder()}
            className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onBrowse}
            disabled={!selectedDisk}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {m.undelete_browse_files()}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {mode === 'directory-missing' 
            ? m.undelete_path_help_directory() 
            : m.undelete_path_help_file()}
        </p>
        {selectedDisk && dataDisk[selectedDisk] && (
          <p className="mt-1 text-xs text-gray-400">
            {m.undelete_base_path()} {dataDisk[selectedDisk]}
          </p>
        )}
      </div>
    </div>
  )
}
