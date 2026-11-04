import { Check, Loader2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSetConfigOption } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { errorMessage } from './Feedback'
import { Input } from './ui/input'
import { Label } from './ui/label'

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
  onSave: (value: number | null) => Promise<void>
}

const OptionField = ({ id, label, help, value, onSave }: OptionFieldProps) => {
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Follow the file after it was reloaded
  useEffect(() => {
    setDraft(value?.toString() ?? '')
  }, [value])

  const trimmed = draft.trim()
  const changed = trimmed !== (value?.toString() ?? '')

  // Saved when the field is left or Enter is pressed, like every other change in the visual editor
  const commit = async () => {
    if (!changed || saving) return
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      setError(m.options_value_invalid())
      return
    }
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await onSave(parsed)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
      className="flex flex-col gap-1.5"
    >
      <Label htmlFor={id} className="justify-between">
        {label}
        {saving ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          saved &&
          !changed && (
            <span className="flex items-center gap-1 text-xs font-normal text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" />
              {m.options_saved()}
            </span>
          )
        )}
      </Label>
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setSaved(false)
        }}
        onBlur={commit}
        placeholder={m.options_not_set()}
        aria-invalid={error ? true : undefined}
        className="tabular-nums"
      />
      <p className="text-xs text-muted-foreground">{help}</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
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
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          {m.options_section_title()}
        </h3>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <OptionField
          id="option-autosave"
          label={m.options_autosave_label()}
          help={m.options_autosave_help()}
          value={autosave}
          onSave={save('autosave')}
        />
        <OptionField
          id="option-blocksize"
          label={m.options_blocksize_label()}
          help={m.options_blocksize_help()}
          value={blocksize}
          onSave={save('blocksize')}
        />
      </div>
    </section>
  )
}
