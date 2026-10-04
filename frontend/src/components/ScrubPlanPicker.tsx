import { useId } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'

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
}: ScrubPlanPickerProps) => {
  // Two pickers can be on one page (schedules), so ids must be unique
  const id = useId()

  return (
    <RadioGroup
      value={value.plan}
      onValueChange={(plan) => onChange({ ...value, plan: plan as ScrubPlan })}
      className="gap-2"
    >
      {PLANS.filter((plan) => !plans || plans.includes(plan.id)).map((plan) => {
        const selected = value.plan === plan.id
        const itemId = `${id}-${plan.id}`
        return (
          <div
            key={plan.id}
            className={cn(
              'rounded-lg border bg-card transition-colors',
              selected
                ? 'border-primary ring-1 ring-primary'
                : 'hover:bg-muted/50',
            )}
          >
            <label
              htmlFor={itemId}
              className="flex cursor-pointer items-start gap-3 p-3"
            >
              <RadioGroupItem id={itemId} value={plan.id} className="mt-0.5" />
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {plan.label()}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {plan.description()}
                </span>
              </span>
            </label>

            {plan.id === 'percent' && selected && (
              <div className="grid grid-cols-2 gap-3 px-3 pb-3 pl-10">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-percent`} className="text-xs">
                    {m.scrub_percent_label()}
                  </Label>
                  <Input
                    id={`${id}-percent`}
                    type="number"
                    min={1}
                    max={100}
                    value={value.percent}
                    onChange={(e) =>
                      onChange({ ...value, percent: e.target.value })
                    }
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-older-than`} className="text-xs">
                    {m.scrub_older_than_label()}
                  </Label>
                  <Input
                    id={`${id}-older-than`}
                    type="number"
                    min={0}
                    value={value.olderThan}
                    onChange={(e) =>
                      onChange({ ...value, olderThan: e.target.value })
                    }
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </RadioGroup>
  )
}
