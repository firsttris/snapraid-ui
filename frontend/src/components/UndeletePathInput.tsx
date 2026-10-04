import { FolderOpen } from 'lucide-react'
import * as m from '../paraglide/messages'
import { Select } from './Select'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

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
  onBrowse,
}: UndeletePathInputProps) => {
  if (mode === 'all-missing') {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Data Disk Selector - for browsing */}
      {Object.keys(dataDisk).length > 1 && (
        <div className="grid gap-2">
          <Label htmlFor="undelete-disk">{m.undelete_browse_from_disk()}</Label>
          <Select
            id="undelete-disk"
            value={selectedDisk}
            onChange={onSelectedDiskChange}
            options={Object.entries(dataDisk).map(([name, path]) => ({
              value: name,
              label: name,
              hint: path,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            {m.undelete_select_disk_help()}
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="undelete-file-path">
          {m.undelete_file_path_label()}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="undelete-file-path"
            type="text"
            value={filePath}
            onChange={(e) => onFilePathChange(e.target.value)}
            placeholder={m.undelete_file_path_placeholder()}
            className="font-mono sm:flex-1"
          />
          <Button variant="outline" onClick={onBrowse} disabled={!selectedDisk}>
            <FolderOpen />
            {m.undelete_browse_files()}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {mode === 'directory-missing'
            ? m.undelete_path_help_directory()
            : m.undelete_path_help_file()}
        </p>
        {selectedDisk && dataDisk[selectedDisk] && (
          <p className="text-xs text-muted-foreground">
            {m.undelete_base_path()}{' '}
            <span className="font-mono">{dataDisk[selectedDisk]}</span>
          </p>
        )}
      </div>
    </div>
  )
}
