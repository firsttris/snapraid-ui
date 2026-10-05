import type { ScheduleOutcome } from '@shared/types'
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
    case 'diff_failed':
      return m.schedules_skip_diff_failed({
        error: localizeServer(outcome.error ?? ''),
      })
    case 'recovery_in_progress':
      return m.schedules_skip_recovery()
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

const formatTime = (hour: number, minute: number) =>
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
