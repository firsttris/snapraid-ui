import type { Schedule, ScheduleOutcome } from '@shared/types'
import { Cron } from 'croner'
import { getCommandLabel } from '../../lib/commands'
import { localizeServer } from '../../lib/i18n'
import * as m from '../../paraglide/messages'
import { getLocale } from '../../paraglide/runtime'
import { getScrubPlanLabel, parseScrubArgs } from '../ScrubPlanPicker'

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary'

export const OUTCOME_VARIANTS: Record<ScheduleOutcome['result'], BadgeVariant> =
  {
    ok: 'success',
    warning: 'warning',
    error: 'destructive',
    aborted: 'secondary',
    incomplete: 'secondary',
    skipped: 'warning',
  }

export const getOutcomeLabel = (result: ScheduleOutcome['result']): string => {
  switch (result) {
    case 'ok':
      return m.run_result_ok()
    case 'warning':
      return m.run_result_warning()
    case 'error':
      return m.run_result_error()
    case 'aborted':
      return m.run_result_aborted()
    case 'incomplete':
      return m.run_result_incomplete()
    case 'skipped':
      return m.schedules_outcome_skipped()
  }
}

export const getOutcomeDetail = (
  outcome: ScheduleOutcome,
): string | undefined => {
  switch (outcome.skipReason) {
    case 'job_running':
      return m.schedules_skip_job_running()
    case 'too_many_deleted':
      return m.schedules_skip_too_many_deleted({
        count: outcome.deletedFiles ?? 0,
      })
    case 'too_many_updated':
      return m.schedules_skip_too_many_updated({
        count: outcome.updatedFiles ?? 0,
      })
    case 'skipped_once':
      return m.schedules_skip_once()
    case 'diff_failed':
      return m.schedules_skip_diff_failed({
        error: localizeServer(outcome.error ?? ''),
      })
    case 'recovery_in_progress':
      return m.schedules_skip_recovery()
    case 'disk_missing':
      return m.schedules_skip_disk_missing({
        disks: (outcome.disks ?? []).join(', '),
      })
    default:
      return outcome.error && localizeServer(outcome.error)
  }
}

// Readable scrub args, e.g. "8%, older than 10 days"
export const describeScrubArgs = (args: string[] | undefined) => {
  const options = parseScrubArgs(args)
  return options.plan === 'percent'
    ? m.schedules_scrub_percent_summary({
        percent: options.percent,
        days: options.olderThan,
      })
    : getScrubPlanLabel(options.plan)
}

// 2023-01-01 was a Sunday, cron counts weekdays from Sunday = 0
export const weekdayName = (day: number) =>
  new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(
    new Date(2023, 0, 1 + day),
  )

export const formatTime = (hour: number, minute: number) =>
  new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(2023, 0, 1, hour, minute))

const NUMBER = /^\d+$/
const STEP = /^\*\/(\d+)$/

/**
 * Plain-language version of the common cron shapes the form produces,
 * undefined for anything else (the raw expression is shown next to it anyway)
 */
export const describeCron = (cron: string): string | undefined => {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const [min, hour, dom, month, dow] = fields
  if (month !== '*') return undefined

  const minuteStep = STEP.exec(min)
  if (minuteStep && hour === '*' && dom === '*' && dow === '*') {
    return m.schedules_human_every_minutes({ count: minuteStep[1] })
  }
  const hourStep = STEP.exec(hour)
  if (hourStep && NUMBER.test(min) && dom === '*' && dow === '*') {
    return m.schedules_human_every_hours({ count: hourStep[1] })
  }
  if (!NUMBER.test(min) || !NUMBER.test(hour)) return undefined
  const h = Number(hour)
  const mi = Number(min)
  if (h > 23 || mi > 59) return undefined
  const time = formatTime(h, mi)

  if (dom === '*' && dow === '*') return m.schedules_human_daily({ time })
  if (dom === '*' && NUMBER.test(dow) && Number(dow) <= 7) {
    return m.schedules_human_weekly({
      day: weekdayName(Number(dow) % 7),
      time,
    })
  }
  if (dow === '*' && NUMBER.test(dom)) {
    return m.schedules_human_monthly({ day: dom, time })
  }
  return undefined
}

// The four shapes the form offers instead of a cron expression
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'hourly'

export interface SimpleSchedule {
  frequency: Frequency
  hour: number
  minute: number
  dayOfWeek: number // 0 = Sunday, as in cron
  dayOfMonth: number
  everyNHours: number
}

export const DEFAULT_SIMPLE_SCHEDULE: SimpleSchedule = {
  frequency: 'daily',
  hour: 2,
  minute: 0,
  dayOfWeek: 0,
  dayOfMonth: 1,
  everyNHours: 6,
}

export const toCron = (s: SimpleSchedule): string => {
  switch (s.frequency) {
    case 'hourly':
      return s.everyNHours === 1
        ? `${s.minute} * * * *`
        : `${s.minute} */${s.everyNHours} * * *`
    case 'weekly':
      return `${s.minute} ${s.hour} * * ${s.dayOfWeek}`
    case 'monthly':
      return `${s.minute} ${s.hour} ${s.dayOfMonth} * *`
    default:
      return `${s.minute} ${s.hour} * * *`
  }
}

const inRange = (value: string, min: number, max: number) =>
  NUMBER.test(value) && Number(value) >= min && Number(value) <= max

/**
 * The simple form of a cron expression, undefined when the form cannot show it,
 * so an existing schedule opens as cron and saving never changes when it runs
 */
export const parseSimpleCron = (cron: string): SimpleSchedule | undefined => {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const [min, hour, dom, month, dow] = fields
  if (month !== '*' || !inRange(min, 0, 59)) return undefined
  const base = { ...DEFAULT_SIMPLE_SCHEDULE, minute: Number(min) }

  const hourStep = STEP.exec(hour)
  if ((hour === '*' || hourStep) && dom === '*' && dow === '*') {
    const everyNHours = hourStep ? Number(hourStep[1]) : 1
    if (everyNHours < 1 || everyNHours > 23) return undefined
    return { ...base, frequency: 'hourly', everyNHours }
  }
  if (!inRange(hour, 0, 23)) return undefined
  const timed = { ...base, hour: Number(hour) }
  if (dom === '*' && dow === '*') return { ...timed, frequency: 'daily' }
  if (dom === '*' && inRange(dow, 0, 7)) {
    return { ...timed, frequency: 'weekly', dayOfWeek: Number(dow) % 7 }
  }
  if (dow === '*' && inRange(dom, 1, 31)) {
    return { ...timed, frequency: 'monthly', dayOfMonth: Number(dom) }
  }
  return undefined
}

/** The next runs of a cron expression, as the scheduler computes them; undefined when it is invalid */
export const nextRuns = (
  cron: string,
  count: number,
  from: Date = new Date(),
): Date[] | undefined => {
  try {
    return new Cron(cron.trim()).nextRuns(count, from)
  } catch {
    return undefined
  }
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  )

// "today 02:00", "tomorrow 02:00", "Sat 02:00", later ones with their date
export const formatRunDay = (date: Date, now: Date = new Date()): string => {
  const time = formatTime(date.getHours(), date.getMinutes())
  const days = daysBetween(now, date)
  if (days === 0) return m.schedules_day_today_at({ time })
  if (days === 1) return m.schedules_day_tomorrow_at({ time })
  const options: Intl.DateTimeFormatOptions =
    days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }
  return `${new Intl.DateTimeFormat(getLocale(), options).format(date)} ${time}`
}

// The commands one run executes, e.g. "Touch → Sync → Scrub (8 %, older than 10 days)"
export const describeRoutine = (
  schedule: Pick<Schedule, 'command' | 'args' | 'touchBefore' | 'scrubAfter'>,
): string | undefined => {
  if (schedule.command === 'scrub') return describeScrubArgs(schedule.args)
  if (schedule.command !== 'sync') return undefined
  const preHash = !!schedule.args?.includes('-h')
  if (!schedule.touchBefore && !schedule.scrubAfter && !preHash)
    return undefined
  const sync = preHash
    ? m.schedules_step_pre_hash({ command: getCommandLabel('sync') })
    : getCommandLabel('sync')
  return [
    schedule.touchBefore && getCommandLabel('touch'),
    sync,
    schedule.scrubAfter &&
      `${getCommandLabel('scrub')} (${describeScrubArgs(schedule.scrubAfter)})`,
  ]
    .filter(Boolean)
    .join(' → ')
}

// Name of a schedule left unnamed, e.g. "Sync · Daily at 02:00"
export const defaultScheduleName = (command: string, cron: string) =>
  [getCommandLabel(command), describeCron(cron) ?? cron].join(' · ')
