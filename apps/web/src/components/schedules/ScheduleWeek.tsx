import type { Schedule } from '@shared/types'
import { getCommandDot, getCommandLabel } from '../../lib/commands'
import { cn } from '../../lib/utils'
import * as m from '../../paraglide/messages'
import { getLocale } from '../../paraglide/runtime'
import { Card } from '../ui/card'
import { formatTime, nextRuns } from './scheduleText'

const DAYS = 7
// Runs of one schedule counted per day, enough for every-minute schedules to read "100+"
const MAX_RUNS_PER_DAY = 100

interface DayRun {
  schedule: Schedule
  first: Date
  count: number
  skipped: boolean // The schedule's next run, which is skipped once
}

const time = (date: Date) => formatTime(date.getHours(), date.getMinutes())

// For each of the next seven days, which schedule runs when
const planWeek = (schedules: Schedule[], now: Date) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Array.from({ length: DAYS }, (_, index) => {
    const start = new Date(today)
    start.setDate(today.getDate() + index)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    const from = index === 0 ? now : new Date(start.getTime() - 1)

    const runs: DayRun[] = []
    for (const schedule of schedules) {
      const dates = (
        nextRuns(schedule.cronExpression, MAX_RUNS_PER_DAY, from) ?? []
      ).filter((date) => date < end)
      if (dates.length === 0) continue
      const next = schedule.nextRun && new Date(schedule.nextRun).getTime()
      runs.push({
        schedule,
        first: dates[0],
        count: dates.length,
        skipped: !!schedule.skipNext && dates[0].getTime() === next,
      })
    }
    runs.sort((a, b) => a.first.getTime() - b.first.getTime())
    return { start, runs }
  })
}

/** What runs on which of the next seven days, so gaps and pile-ups show at a glance */
export const ScheduleWeek = ({ schedules }: { schedules: Schedule[] }) => {
  const active = schedules.filter((s) => s.enabled)
  if (active.length === 0) return null
  const now = new Date()
  const week = planWeek(active, now)
  const commands = [...new Set(active.map((s) => s.command))]
  const dayFormat = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  })

  return (
    <section aria-label={m.schedules_week_title()}>
      <Card className="gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-semibold">{m.schedules_week_title()}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {commands.map((command) => (
              <li key={command} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn('size-2 rounded-full', getCommandDot(command))}
                />
                {getCommandLabel(command)}
              </li>
            ))}
          </ul>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <ol className="grid min-w-[44rem] grid-cols-7 gap-2">
            {week.map(({ start, runs }, index) => (
              <li
                key={start.toISOString()}
                className={cn(
                  'flex min-h-24 min-w-0 flex-col gap-1.5 rounded-lg border p-2',
                  index === 0 && 'border-foreground/25 bg-muted/50',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {index === 0
                    ? m.schedules_day_today()
                    : dayFormat.format(start)}
                </span>
                {runs.map((run) => (
                  <span
                    key={run.schedule.id}
                    title={
                      run.skipped
                        ? `${run.schedule.name} · ${m.schedules_skip_next_badge()}`
                        : run.schedule.name
                    }
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 text-xs',
                      run.skipped && 'text-muted-foreground line-through',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        getCommandDot(run.schedule.command),
                      )}
                    />
                    <span className="shrink-0 font-mono tabular-nums">
                      {time(run.first)}
                    </span>
                    <span className="min-w-0 truncate">
                      {run.schedule.name}
                    </span>
                    {run.count > 1 && (
                      <span className="shrink-0 text-muted-foreground">
                        {run.count >= MAX_RUNS_PER_DAY
                          ? m.schedules_week_many({ count: MAX_RUNS_PER_DAY })
                          : m.schedules_week_times({ count: run.count })}
                      </span>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </div>

        <p className="text-xs text-muted-foreground">
          {m.schedules_week_hint()}
        </p>
      </Card>
    </section>
  )
}
