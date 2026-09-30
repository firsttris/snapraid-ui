import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDiskReplacement } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { DirectoryBrowser } from './DirectoryBrowser'
import { RemoveDataDiskWizard } from './RemoveDataDiskWizard'
import { ReplaceDiskWizard } from './ReplaceDiskWizard'

interface DataDiskSectionProps {
  configPath: string
  data: Record<string, string>
  pendingRemoval: string[]
  onAdd: (name: string, path: string) => Promise<void>
}

export const DataDiskSection = ({
  configPath,
  data,
  pendingRemoval,
  onAdd,
}: DataDiskSectionProps) => {
  // Captured on open, the wizard outlives the disk disappearing from the list
  const [removing, setRemoving] = useState<{
    name: string
    path: string
    pending: boolean
  } | null>(null)
  const [replacing, setReplacing] = useState<{
    name: string
    path: string
  } | null>(null)
  const { data: replacement } = useDiskReplacement(configPath)
  const replacingDisk =
    replacement && !replacement.completedAt ? replacement.diskName : null
  const [showAddDataDisk, setShowAddDataDisk] = useState(false)
  const [newDataDiskName, setNewDataDiskName] = useState('')
  const [newDataDiskPath, setNewDataDiskPath] = useState('')
  const [addingDataDisk, setAddingDataDisk] = useState(false)
  const [showDataDiskBrowser, setShowDataDiskBrowser] = useState(false)
  const [error, setError] = useState('')

  const handleAddDataDisk = async () => {
    if (!newDataDiskName.trim() || !newDataDiskPath.trim()) {
      setError(m.data_disk_name_and_path_required())
      return
    }

    setAddingDataDisk(true)
    setError('')
    try {
      await onAdd(newDataDiskName.trim(), newDataDiskPath.trim())
      setNewDataDiskName('')
      setNewDataDiskPath('')
      setShowAddDataDisk(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingDataDisk(false)
    }
  }

  return (
    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-green-900 flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
          {m.data_disk_title()} ({Object.keys(data).length})
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddDataDisk(!showAddDataDisk)}
        >
          <Plus size={14} />
          {m.data_disk_add_disk()}
        </Button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showAddDataDisk && (
        <div className="mb-3 p-3 bg-white rounded border border-green-300">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label
                htmlFor="data-disk-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {m.data_disk_name_label()}
              </label>
              <input
                id="data-disk-name"
                type="text"
                value={newDataDiskName}
                onChange={(e) => setNewDataDiskName(e.target.value)}
                placeholder={m.data_disk_name_placeholder()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="data-disk-path"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {m.data_disk_path_label()}
              </label>
              <div className="flex gap-2">
                <input
                  id="data-disk-path"
                  type="text"
                  value={newDataDiskPath}
                  onChange={(e) => setNewDataDiskPath(e.target.value)}
                  placeholder={m.data_disk_path_placeholder()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => setShowDataDiskBrowser(true)}
                  title={m.data_disk_browse()}
                >
                  {m.config_manager_browse()}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAddDataDisk}
              disabled={addingDataDisk}
            >
              {addingDataDisk ? m.common_adding() : m.common_add()}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAddDataDisk(false)
                setNewDataDiskName('')
                setNewDataDiskPath('')
                setError('')
              }}
            >
              {m.common_cancel()}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {Object.keys(data).length === 0 ? (
          <div className="text-sm text-green-600 italic">
            {m.data_disk_no_disks()}
          </div>
        ) : (
          Object.entries(data).map(([name, path]) => {
            const pending = pendingRemoval.includes(name)
            return (
              <div
                key={name}
                className="flex justify-between items-center bg-white p-3 rounded border border-green-200"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="font-semibold text-purple-600 text-sm">
                    {name}
                  </span>
                  <span className="font-mono text-sm text-gray-700">
                    {path}
                  </span>
                  {pending && (
                    <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">
                      {m.data_disk_pending_removal()}
                    </span>
                  )}
                  {replacingDisk === name && (
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs whitespace-nowrap">
                      {m.replace_disk_badge()}
                    </span>
                  )}
                </div>
                {!pending && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReplacing({ name, path })}
                    title={m.replace_disk_button_title()}
                    className="ml-3"
                  >
                    {replacingDisk === name
                      ? m.replace_disk_resume()
                      : m.replace_disk_button()}
                  </Button>
                )}
                <Button
                  variant="ghostDanger"
                  size={pending ? 'sm' : 'iconSm'}
                  onClick={() => setRemoving({ name, path, pending })}
                  disabled={replacingDisk === name}
                  aria-label={m.common_remove()}
                  title={m.common_remove()}
                  className="ml-2"
                >
                  {pending ? (
                    m.data_disk_resume_removal()
                  ) : (
                    <Trash2 size={16} />
                  )}
                </Button>
              </div>
            )
          })
        )}
      </div>

      {removing && (
        <RemoveDataDiskWizard
          configPath={configPath}
          diskName={removing.name}
          diskPath={removing.path}
          pending={removing.pending}
          onClose={() => setRemoving(null)}
        />
      )}

      {replacing && (
        <ReplaceDiskWizard
          configPath={configPath}
          diskName={replacing.name}
          diskType="data"
          currentPath={replacing.path}
          onClose={() => setReplacing(null)}
        />
      )}

      {showDataDiskBrowser && (
        <DirectoryBrowser
          title={m.data_disk_select_directory()}
          currentValue={newDataDiskPath}
          onSelect={(path) => {
            setNewDataDiskPath(path)
            setShowDataDiskBrowser(false)
          }}
          onClose={() => setShowDataDiskBrowser(false)}
        />
      )}
    </div>
  )
}
