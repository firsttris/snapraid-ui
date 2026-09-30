import { useState } from 'react'
import * as m from '../paraglide/messages'
import { Button } from './Button'

type CheckMode = 'full' | 'audit'

interface CheckDialogProps {
  dataDisks: string[]
  onClose: () => void
  onConfirm: (args: string[]) => void
}

export const checkArgs = (mode: CheckMode, disks: string[], all: boolean) => [
  ...(mode === 'audit' ? ['-a'] : []),
  // No -d checks every disk
  ...(all ? [] : disks.flatMap((disk) => ['-d', disk])),
]

const MODES: Array<{
  id: CheckMode
  label: () => string
  description: () => string
}> = [
  {
    id: 'audit',
    label: m.check_mode_audit,
    description: m.check_mode_audit_desc,
  },
  { id: 'full', label: m.check_mode_full, description: m.check_mode_full_desc },
]

export const CheckDialog = ({
  dataDisks,
  onClose,
  onConfirm,
}: CheckDialogProps) => {
  const [mode, setMode] = useState<CheckMode>('audit')
  const [selected, setSelected] = useState<string[]>(dataDisks)

  const all = selected.length === dataDisks.length
  const args = checkArgs(mode, selected, all)

  const toggle = (disk: string) =>
    setSelected((current) =>
      current.includes(disk)
        ? current.filter((d) => d !== disk)
        : dataDisks.filter((d) => d === disk || current.includes(d)),
    )

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">{m.check_dialog_title()}</h2>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <p className="text-gray-700">{m.check_dialog_intro()}</p>

          <fieldset className="space-y-2">
            {MODES.map(({ id, label, description }) => (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                  mode === id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="check-mode"
                  checked={mode === id}
                  onChange={() => setMode(id)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-gray-900">
                    {label()}
                  </span>
                  <span className="block text-sm text-gray-600">
                    {description()}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">
              {m.check_dialog_disks()}
            </span>
            <div className="flex flex-wrap gap-2">
              {dataDisks.map((disk) => (
                <label
                  key={disk}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    selected.includes(disk)
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(disk)}
                    onChange={() => toggle(disk)}
                  />
                  {disk}
                </label>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-600">{m.check_dialog_job_hint()}</p>

          <p className="font-mono text-xs text-gray-500">
            snapraid check {args.join(' ')}
          </p>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <Button onClick={onClose} variant="secondary">
            {m.common_cancel()}
          </Button>
          <Button
            onClick={() => onConfirm(args)}
            disabled={selected.length === 0}
          >
            {m.check_dialog_start()}
          </Button>
        </div>
      </div>
    </div>
  )
}
