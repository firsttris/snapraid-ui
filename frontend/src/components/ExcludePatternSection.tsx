import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { useFeedback } from './Feedback'

interface ExcludePatternSectionProps {
  exclude: string[]
  onAdd: (pattern: string) => Promise<void>
  onRemove: (pattern: string) => Promise<void>
}

export const ExcludePatternSection = ({
  exclude,
  onAdd,
  onRemove,
}: ExcludePatternSectionProps) => {
  const { confirm } = useFeedback()
  const [showAddExclude, setShowAddExclude] = useState(false)
  const [newExcludePattern, setNewExcludePattern] = useState('')
  const [addingExclude, setAddingExclude] = useState(false)
  const [error, setError] = useState('')

  const handleAddExclude = async () => {
    if (!newExcludePattern.trim()) {
      setError(m.exclude_pattern_pattern_required())
      return
    }

    setAddingExclude(true)
    setError('')
    try {
      await onAdd(newExcludePattern.trim())
      setNewExcludePattern('')
      setShowAddExclude(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setAddingExclude(false)
    }
  }

  const handleRemoveExclude = async (pattern: string) => {
    const confirmed = await confirm({
      message: m.exclude_pattern_confirm_remove({ pattern }),
      confirmLabel: m.confirm_remove(),
      danger: true,
    })
    if (!confirmed) return

    setError('')
    try {
      await onRemove(pattern)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-orange-900 flex items-center gap-2">
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          {m.exclude_pattern_title()} ({exclude.length})
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddExclude(!showAddExclude)}
        >
          <Plus size={14} />
          {m.exclude_pattern_add_pattern()}
        </Button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showAddExclude && (
        <div className="mb-3 p-3 bg-white rounded border border-orange-300">
          <label
            htmlFor="exclude-pattern"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {m.exclude_pattern_label()}
            <span className="text-xs text-gray-500 ml-2">
              ({m.exclude_pattern_hint()})
            </span>
          </label>
          <input
            id="exclude-pattern"
            type="text"
            value={newExcludePattern}
            onChange={(e) => setNewExcludePattern(e.target.value)}
            placeholder={m.exclude_pattern_pattern_placeholder()}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={handleAddExclude}
              disabled={addingExclude}
            >
              {addingExclude ? m.common_adding() : m.common_add()}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAddExclude(false)
                setNewExcludePattern('')
                setError('')
              }}
            >
              {m.common_cancel()}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {exclude.length === 0 ? (
          <div className="text-sm text-orange-600 italic">
            {m.exclude_pattern_no_patterns()}
          </div>
        ) : (
          exclude.map((pattern, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: patterns are not guaranteed unique
              key={index}
              className="flex justify-between items-center bg-white p-3 rounded border border-orange-200"
            >
              <div className="font-mono text-sm text-gray-700 flex-1">
                {pattern}
              </div>
              <Button
                variant="ghostDanger"
                size="iconSm"
                onClick={() => handleRemoveExclude(pattern)}
                aria-label={m.common_remove()}
                title={m.common_remove()}
                className="ml-3"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
