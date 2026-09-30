import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSetConfigOption } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { errorMessage } from './Feedback'

type OptionKey = 'autosave' | 'blocksize'

interface OptionsSectionProps {
  configPath: string
  autosave?: number
  blocksize?: number
  onUpdate?: () => void
}

interface OptionFieldProps {
  id: string
  label: string
  help: string
  value?: number
  saving: boolean
  onSave: (value: number | null) => Promise<void>
}

const OptionField = ({
  id,
  label,
  help,
  value,
  saving,
  onSave,
}: OptionFieldProps) => {
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [error, setError] = useState('')

  // Follow the file after it was reloaded
  useEffect(() => {
    setDraft(value?.toString() ?? '')
  }, [value])

  const trimmed = draft.trim()
  const changed = trimmed !== (value?.toString() ?? '')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      setError(m.options_value_invalid())
      return
    }
    setError('')
    try {
      await onSave(parsed)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={m.options_not_set()}
          className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <Button type="submit" size="sm" disabled={!changed || saving}>
          {m.common_save()}
        </Button>
      </div>
      <p className="mt-1 text-xs text-gray-500">{help}</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  )
}

export const OptionsSection = ({
  configPath,
  autosave,
  blocksize,
  onUpdate,
}: OptionsSectionProps) => {
  const setOptionMutation = useSetConfigOption()

  const save = (option: OptionKey) => async (value: number | null) => {
    await setOptionMutation.mutateAsync({ configPath, option, value })
    onUpdate?.()
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h3 className="mb-3 font-semibold text-gray-900 flex items-center gap-2">
        <SlidersHorizontal size={20} />
        {m.options_section_title()}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <OptionField
          id="option-autosave"
          label={m.options_autosave_label()}
          help={m.options_autosave_help()}
          value={autosave}
          saving={setOptionMutation.isPending}
          onSave={save('autosave')}
        />
        <OptionField
          id="option-blocksize"
          label={m.options_blocksize_label()}
          help={m.options_blocksize_help()}
          value={blocksize}
          saving={setOptionMutation.isPending}
          onSave={save('blocksize')}
        />
      </div>
    </div>
  )
}
