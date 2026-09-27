import * as m from '../paraglide/messages'

export type ScrubPlan = 'default' | 'percent' | 'new' | 'bad' | 'full'

// Percent and age stay strings while editing, so the inputs can be cleared
export interface ScrubOptions {
  plan: ScrubPlan
  percent: string
  olderThan: string
}

// SnapRAID defaults when scrub runs without -p/-o
export const DEFAULT_SCRUB_OPTIONS: ScrubOptions = {
  plan: 'default',
  percent: '8',
  olderThan: '10',
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

const isWholeNumber = (value: string, min: number, max = Infinity) => {
  const number = Number(value)
  return (
    value.trim() !== '' &&
    Number.isInteger(number) &&
    number >= min &&
    number <= max
  )
}

export const isValidScrubOptions = ({
  plan,
  percent,
  olderThan,
}: ScrubOptions) =>
  plan !== 'percent' ||
  (isWholeNumber(percent, 1, 100) && isWholeNumber(olderThan, 0))

export const scrubArgs = ({
  plan,
  percent,
  olderThan,
}: ScrubOptions): string[] => {
  switch (plan) {
    case 'default':
      return []
    case 'percent':
      return ['-p', String(Number(percent)), '-o', String(Number(olderThan))]
    default:
      return ['-p', plan]
  }
}

/**
 * Read back options written by scrubArgs, e.g. from a stored schedule
 */
export const parseScrubArgs = (args: string[] = []): ScrubOptions => {
  const value = (flag: string) => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }
  const plan = value('-p')
  if (plan === undefined) return DEFAULT_SCRUB_OPTIONS
  if (plan === 'new' || plan === 'bad' || plan === 'full') {
    return { ...DEFAULT_SCRUB_OPTIONS, plan }
  }
  return {
    plan: 'percent',
    percent: plan,
    olderThan: value('-o') ?? DEFAULT_SCRUB_OPTIONS.olderThan,
  }
}

export const getScrubPlanLabel = (plan: ScrubPlan) =>
  PLANS.find((p) => p.id === plan)?.label() ?? plan

interface ScrubPlanPickerProps {
  value: ScrubOptions
  onChange: (value: ScrubOptions) => void
  plans?: ScrubPlan[]
}

export const ScrubPlanPicker = ({
  value,
  onChange,
  plans,
}: ScrubPlanPickerProps) => (
  <fieldset className="space-y-2">
    {PLANS.filter(({ id }) => !plans || plans.includes(id)).map(
      ({ id, label, description }) => (
        <div
          key={id}
          className={`rounded-lg border p-3 ${
            value.plan === id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:bg-gray-50'
          }`}
        >
          <label className="flex cursor-pointer gap-3">
            <input
              type="radio"
              name="scrub-plan"
              value={id}
              checked={value.plan === id}
              onChange={() => onChange({ ...value, plan: id })}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900">{label()}</p>
              <p className="text-sm text-gray-600">{description()}</p>
            </div>
          </label>

          {id === 'percent' && value.plan === 'percent' && (
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
                  value={value.percent}
                  onChange={(e) =>
                    onChange({ ...value, percent: e.target.value })
                  }
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
                  value={value.olderThan}
                  onChange={(e) =>
                    onChange({ ...value, olderThan: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          )}
        </div>
      ),
    )}
  </fieldset>
)
