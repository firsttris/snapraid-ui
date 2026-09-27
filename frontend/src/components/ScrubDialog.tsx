import { useState } from 'react'
import * as m from '../paraglide/messages'

type ScrubPlan = 'default' | 'percent' | 'new' | 'bad' | 'full'

// SnapRAID defaults when scrub runs without -p/-o
const DEFAULT_PERCENT = 8
const DEFAULT_OLDER_THAN_DAYS = 10

interface ScrubDialogProps {
  badBlocks: number
  onClose: () => void
  onConfirm: (args: string[]) => void
}

const PLANS: Array<{
  id: ScrubPlan
  label: () => string
  description: () => string
}> = [
  {
    id: 'default',
    label: m.scrub_plan_default,
    description: m.scrub_plan_default_desc,
  },
  {
    id: 'percent',
    label: m.scrub_plan_percent,
    description: m.scrub_plan_percent_desc,
  },
  { id: 'new', label: m.scrub_plan_new, description: m.scrub_plan_new_desc },
  { id: 'bad', label: m.scrub_plan_bad, description: m.scrub_plan_bad_desc },
  { id: 'full', label: m.scrub_plan_full, description: m.scrub_plan_full_desc },
]

export const ScrubDialog = ({
  badBlocks,
  onClose,
  onConfirm,
}: ScrubDialogProps) => {
  const [plan, setPlan] = useState<ScrubPlan>(badBlocks > 0 ? 'bad' : 'default')
  const [percent, setPercent] = useState(String(DEFAULT_PERCENT))
  const [olderThan, setOlderThan] = useState(String(DEFAULT_OLDER_THAN_DAYS))

  const percentValue = Number(percent)
  const olderThanValue = Number(olderThan)
  const isValid =
    plan !== 'percent' ||
    (Number.isInteger(percentValue) &&
      percentValue >= 1 &&
      percentValue <= 100 &&
      Number.isInteger(olderThanValue) &&
      olderThanValue >= 0)

  const buildArgs = (): string[] => {
    switch (plan) {
      case 'default':
        return []
      case 'percent':
        return ['-p', String(percentValue), '-o', String(olderThanValue)]
      default:
        return ['-p', plan]
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">{m.scrub_dialog_title()}</h2>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-gray-700">{m.scrub_dialog_intro()}</p>

          {badBlocks > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              ⚠️ {m.scrub_bad_blocks_hint({ count: badBlocks })}
            </div>
          )}

          <fieldset className="space-y-2">
            {PLANS.map(({ id, label, description }) => (
              <div
                key={id}
                className={`rounded-lg border p-3 ${
                  plan === id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="radio"
                    name="scrub-plan"
                    value={id}
                    checked={plan === id}
                    onChange={() => setPlan(id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{label()}</p>
                    <p className="text-sm text-gray-600">{description()}</p>
                  </div>
                </label>

                {id === 'percent' && plan === 'percent' && (
                  <div className="mt-3 ml-7 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="scrub-percent"
                        className="block text-xs font-medium text-gray-700 mb-1"
                      >
                        {m.scrub_percent_label()}
                      </label>
                      <input
                        id="scrub-percent"
                        type="number"
                        min={1}
                        max={100}
                        value={percent}
                        onChange={(e) => setPercent(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="scrub-older-than"
                        className="block text-xs font-medium text-gray-700 mb-1"
                      >
                        {m.scrub_older_than_label()}
                      </label>
                      <input
                        id="scrub-older-than"
                        type="number"
                        min={0}
                        value={olderThan}
                        onChange={(e) => setOlderThan(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </fieldset>

          <p className="font-mono text-xs text-gray-500">
            snapraid scrub {buildArgs().join(' ')}
          </p>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {m.common_cancel()}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(buildArgs())}
            disabled={!isValid}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {m.scrub_dialog_start()}
          </button>
        </div>
      </div>
    </div>
  )
}
