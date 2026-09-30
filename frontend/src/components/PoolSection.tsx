import { Plus } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { DirectoryBrowser } from './DirectoryBrowser'
import { useFeedback } from './Feedback'

interface PoolSectionProps {
  pool?: string
  onPoolChange: (pool: string | undefined) => void
}

export const PoolSection = ({ pool, onPoolChange }: PoolSectionProps) => {
  const { confirm, toast } = useFeedback()
  const [showBrowser, setShowBrowser] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [localPool, setLocalPool] = useState(pool || '')

  const handleAdd = () => {
    if (!localPool.trim()) {
      toast.error(m.pool_directory_required())
      return
    }
    onPoolChange(localPool.trim())
    setEditMode(false)
  }

  const handleRemove = async () => {
    const confirmed = await confirm({
      message: m.pool_confirm_remove(),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return
    onPoolChange(undefined)
    setLocalPool('')
    setEditMode(false)
  }

  const handleBrowserSelect = (path: string) => {
    setLocalPool(path)
    setShowBrowser(false)
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{m.pool_section_title()}</h3>
          {!editMode && !pool && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditMode(true)}
            >
              <Plus size={14} />
              {m.common_add()}
            </Button>
          )}
        </div>

        {!pool && !editMode ? (
          <p className="text-gray-500 text-center py-8">
            {m.pool_no_pool_configured()}
          </p>
        ) : editMode || pool ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="pool-directory"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                {m.pool_directory_label()}
              </label>
              <div className="flex gap-2">
                <input
                  id="pool-directory"
                  type="text"
                  value={editMode ? localPool : pool}
                  onChange={(e) => editMode && setLocalPool(e.target.value)}
                  placeholder={m.pool_directory_placeholder()}
                  disabled={!editMode}
                  className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {editMode && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowBrowser(true)}
                  >
                    {m.pool_directory_browse()}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {m.pool_directory_help()}
              </p>
            </div>

            {editMode ? (
              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditMode(false)
                    setLocalPool(pool || '')
                  }}
                >
                  {m.common_cancel()}
                </Button>
                <Button size="sm" onClick={handleAdd}>
                  {m.common_save()}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLocalPool(pool || '')
                    setEditMode(true)
                  }}
                >
                  {m.common_edit()}
                </Button>
                <Button variant="ghostDanger" size="sm" onClick={handleRemove}>
                  {m.common_remove()}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
          currentValue={localPool || '/'}
          title={m.pool_select_directory()}
        />
      )}
    </>
  )
}
