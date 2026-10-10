import type { Schedule, SnapRaidCommand } from '@shared/types'
import { RadioGroup } from 'radix-ui'
import { type ReactNode, useId, useState } from 'react'
import {
  getCommandDescription,
  getCommandIcon,
  getCommandLabel,
  getCommandTone,
} from '../../lib/commands'
import { cn } from '../../lib/utils'
import * as m from '../../paraglide/messages'
import {
  DEFAULT_SCRUB_OPTIONS,
  isValidScrubOptions,
  parseScrubArgs,
  type ScrubOptions,
  type ScrubPlan,
  ScrubPlanPicker,
  scrubArgs,
} from '../ScrubPlanPicker'
import { SegmentedControl } from '../SegmentedControl'
import { Select } from '../Select'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet'
import { Switch } from '../ui/switch'
import {
  DEFAULT_SIMPLE_SCHEDULE,
  defaultScheduleName,
  type Frequency,
  formatRunDay,
  nextRuns,
  parseSimpleCron,
  type SimpleSchedule,
  toCron,
  weekdayName,
} from './scheduleText'

export type ScheduleInput = Omit<
  Schedule,
  'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'
>

// What a schedule is for; status and diff only stay for schedules that already run them
const SCHEDULE_COMMANDS: SnapRaidCommand[] = ['sync', 'scrub', 'check', 'smart']

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'hourly']

const frequencyLabel = (frequency: Frequency) => {
  switch (frequency) {
    case 'daily':
      return m.schedules_freq_daily()
    case 'weekly':
      return m.schedules_freq_weekly()
    case 'monthly':
      return m.schedules_freq_monthly()
    case 'hourly':
      return m.schedules_freq_hourly()
  }
}

// Repairs follow a scrub that found errors, so scrub -p bad is not a schedule plan
const SCHEDULE_SCRUB_PLANS: ScrubPlan[] = ['default', 'percent', 'new', 'full']

// Scrub after a sync: the default checks the oldest 8%, new keeps up with fresh data
const SYNC_SCRUB_PLANS: ScrubPlan[] = ['default', 'percent', 'new']

// Suggested limits once the sync guard is switched on
const DEFAULT_MAX_DELETED_FILES = 50
// As snapraid-daemon's sync_threshold_updates
const DEFAULT_MAX_UPDATED_FILES = 100

const pad = (value: number) => String(value).padStart(2, '0')

// A setting with title, hint and a switch on the right, extra fields below when on
const OptionRow = ({
  id,
  title,
  hint,
  checked,
  onCheckedChange,
  children,
}: {
  id: string
  title: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children?: ReactNode
}) => (
  <div className="flex flex-col gap-3 p-4">
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={id} className="cursor-pointer leading-snug">
          {title}
        </Label>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
    </div>
    {checked && children}
  </div>
)

const Section = ({
  step,
  title,
  hint,
  children,
}: {
  step: number
  title: string
  hint?: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="text-sm font-semibold">
        <span className="text-muted-foreground">{step} · </span>
        {title}
      </h3>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
)

interface ScheduleFormProps {
  schedule?: Schedule
  configs: Array<{ name: string; path: string }>
  onSubmit: (schedule: ScheduleInput) => void
  onCancel: () => void
}

/** Create or edit a schedule, inside a SheetContent */
export const ScheduleForm = ({
  schedule,
  configs,
  onSubmit,
  onCancel,
}: ScheduleFormProps) => {
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [name, setName] = useState(schedule?.name || '')
  const [command, setCommand] = useState<SnapRaidCommand>(
    schedule?.command || 'sync',
  )
  const [configPath, setConfigPath] = useState(
    schedule?.configPath || configs[0]?.path || '',
  )
  const [scrubOptions, setScrubOptions] = useState<ScrubOptions>(() =>
    parseScrubArgs(schedule?.command === 'scrub' ? schedule.args : []),
  )

  // Routine: nothing extra unless asked for
  const [touchBefore, setTouchBefore] = useState(!!schedule?.touchBefore)
  const [preHash, setPreHash] = useState(
    schedule?.command === 'sync' && !!schedule.args?.includes('-h'),
  )
  const [scrubAfter, setScrubAfter] = useState(!!schedule?.scrubAfter)
  const [scrubAfterOptions, setScrubAfterOptions] = useState<ScrubOptions>(
    () =>
      schedule?.scrubAfter
        ? parseScrubArgs(schedule.scrubAfter)
        : DEFAULT_SCRUB_OPTIONS,
  )

  // Sync guard: off for new schedules
  const [guard, setGuard] = useState(
    schedule?.maxDeletedFiles != null || schedule?.maxUpdatedFiles != null,
  )
  const [maxDeletedFiles, setMaxDeletedFiles] = useState(
    schedule
      ? (schedule.maxDeletedFiles?.toString() ?? '')
      : String(DEFAULT_MAX_DELETED_FILES),
  )
  const [maxUpdatedFiles, setMaxUpdatedFiles] = useState(
    schedule
      ? (schedule.maxUpdatedFiles?.toString() ?? '')
      : String(DEFAULT_MAX_UPDATED_FILES),
  )
  const switchGuard = (on: boolean) => {
    // Turned on without limits, it starts from the suggested ones
    if (on && !maxDeletedFiles.trim() && !maxUpdatedFiles.trim()) {
      setMaxDeletedFiles(String(DEFAULT_MAX_DELETED_FILES))
      setMaxUpdatedFiles(String(DEFAULT_MAX_UPDATED_FILES))
    }
    setGuard(on)
  }
  const isLimit = (value: string) =>
    value.trim() === '' ||
    (Number.isInteger(Number(value)) && Number(value) >= 0)
  // At least one limit, an empty one means no limit for that kind
  const isGuardValid =
    isLimit(maxDeletedFiles) &&
    isLimit(maxUpdatedFiles) &&
    (maxDeletedFiles.trim() !== '' || maxUpdatedFiles.trim() !== '')
  const limit = (value: string) =>
    guard && value.trim() !== '' ? Number(value) : null

  // An existing schedule opens in the simple form when it fits, otherwise as cron,
  // so saving other fields never changes when it runs
  const existingSimple = schedule && parseSimpleCron(schedule.cronExpression)
  const [useCron, setUseCron] = useState(!!schedule && !existingSimple)
  const [simple, setSimple] = useState<SimpleSchedule>(
    existingSimple || DEFAULT_SIMPLE_SCHEDULE,
  )
  const [rawCron, setRawCron] = useState(
    schedule?.cronExpression ?? toCron(DEFAULT_SIMPLE_SCHEDULE),
  )
  const update = (changes: Partial<SimpleSchedule>) =>
    setSimple((current) => ({ ...current, ...changes }))

  const cronExpression = useCron ? rawCron.trim() : toCron(simple)
  const upcoming = nextRuns(cronExpression, 3)
  const backToSimple = useCron ? parseSimpleCron(rawCron) : undefined

  const isOptionsValid =
    !!upcoming &&
    (command === 'scrub'
      ? isValidScrubOptions(scrubOptions)
      : command !== 'sync' ||
        ((!guard || isGuardValid) &&
          (!scrubAfter || isValidScrubOptions(scrubAfterOptions))))

  const commands = SCHEDULE_COMMANDS.includes(command)
    ? SCHEDULE_COMMANDS
    : [...SCHEDULE_COMMANDS, command]
  const configName = configs.find((c) => c.path === configPath)?.name
  const placeholderName = defaultScheduleName(command, cronExpression)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOptionsValid) return
    const isSync = command === 'sync'
    onSubmit({
      name: name.trim() || placeholderName,
      command,
      configPath,
      cronExpression,
      // Switched on and off in the list, not here
      enabled: schedule?.enabled ?? true,
      args:
        command === 'scrub'
          ? scrubArgs(scrubOptions)
          : isSync && preHash
            ? ['-h']
            : [],
      maxDeletedFiles: isSync ? limit(maxDeletedFiles) : null,
      maxUpdatedFiles: isSync ? limit(maxUpdatedFiles) : null,
      touchBefore: isSync && touchBefore,
      scrubAfter: isSync && scrubAfter ? scrubArgs(scrubAfterOptions) : null,
    })
  }

  const timeInput = (
    <div className="flex flex-col gap-2">
      <Label htmlFor={fieldId('time')}>{m.schedules_time()}</Label>
      <Input
        id={fieldId('time')}
        type="time"
        required
        value={`${pad(simple.hour)}:${pad(simple.minute)}`}
        onChange={(e) => {
          const [hour, minute] = e.target.value.split(':').map(Number)
          if (Number.isInteger(hour) && Number.isInteger(minute)) {
            update({ hour, minute })
          }
        }}
        className="w-32 font-mono tabular-nums"
      />
    </div>
  )

  let step = 0
  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b px-6 py-4 pr-12">
        <SheetTitle className="text-lg">
          {schedule ? m.schedules_edit_title() : m.schedules_new_title()}
        </SheetTitle>
        <SheetDescription>
          {schedule
            ? schedule.name
            : configs.length === 1 && configName
              ? m.schedules_new_for({ name: configName })
              : m.schedules_new_hint()}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-7 px-6 py-5">
        {configs.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId('config')}>
              {m.schedules_field_config()}
            </Label>
            <Select
              id={fieldId('config')}
              value={configPath}
              onChange={setConfigPath}
              options={configs.map((cfg) => ({
                value: cfg.path,
                label: cfg.name,
              }))}
            />
          </div>
        )}

        <Section step={++step} title={m.schedules_what()}>
          <RadioGroup.Root
            value={command}
            onValueChange={(value) => setCommand(value as SnapRaidCommand)}
            aria-label={m.schedules_what()}
            className="grid grid-cols-2 gap-2"
          >
            {commands.map((cmd) => {
              const Icon = getCommandIcon(cmd)
              return (
                <RadioGroup.Item
                  key={cmd}
                  value={cmd}
                  className="flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-accent/40 data-[state=checked]:ring-1 data-[state=checked]:ring-primary"
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md',
                      getCommandTone(cmd),
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm font-medium">
                    {getCommandLabel(cmd)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getCommandDescription(cmd)}
                  </span>
                </RadioGroup.Item>
              )
            })}
          </RadioGroup.Root>
        </Section>

        <Section step={++step} title={m.schedules_when()}>
          {useCron ? (
            <div className="flex flex-col gap-2">
              <Input
                id={fieldId('raw-cron')}
                type="text"
                value={rawCron}
                onChange={(e) => setRawCron(e.target.value)}
                required
                className="font-mono"
                aria-label={m.schedules_mode_cron()}
                aria-invalid={!upcoming || undefined}
                aria-describedby={fieldId('cron-help')}
              />
              <p
                id={fieldId('cron-help')}
                className="text-sm text-muted-foreground"
              >
                {m.schedules_cron_help()}
              </p>
            </div>
          ) : (
            <>
              <SegmentedControl
                options={FREQUENCIES.map((value) => ({
                  value,
                  label: frequencyLabel(value),
                }))}
                value={simple.frequency}
                onChange={(frequency) => update({ frequency })}
              />
              <div className="flex flex-wrap items-end gap-4">
                {simple.frequency === 'weekly' && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={fieldId('day-of-week')}>
                      {m.schedules_day_of_week()}
                    </Label>
                    <Select
                      id={fieldId('day-of-week')}
                      value={simple.dayOfWeek}
                      onChange={(dayOfWeek) => update({ dayOfWeek })}
                      // Starting on Monday, as calendars here do
                      options={[1, 2, 3, 4, 5, 6, 0].map((day) => ({
                        value: day,
                        label: weekdayName(day),
                      }))}
                    />
                  </div>
                )}
                {simple.frequency === 'monthly' && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={fieldId('day-of-month')}>
                      {m.schedules_day_of_month()}
                    </Label>
                    <Input
                      id={fieldId('day-of-month')}
                      type="number"
                      min={1}
                      max={31}
                      required
                      value={simple.dayOfMonth}
                      onChange={(e) =>
                        update({ dayOfMonth: Number(e.target.value) })
                      }
                      className="w-24 font-mono tabular-nums"
                    />
                  </div>
                )}
                {simple.frequency === 'hourly' ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={fieldId('every-n-hours')}>
                        {m.schedules_every_n_hours()}
                      </Label>
                      <Input
                        id={fieldId('every-n-hours')}
                        type="number"
                        min={1}
                        max={23}
                        required
                        value={simple.everyNHours}
                        onChange={(e) =>
                          update({ everyNHours: Number(e.target.value) })
                        }
                        className="w-24 font-mono tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={fieldId('minute')}>
                        {m.schedules_at_minute()}
                      </Label>
                      <Input
                        id={fieldId('minute')}
                        type="number"
                        min={0}
                        max={59}
                        required
                        value={simple.minute}
                        onChange={(e) =>
                          update({ minute: Number(e.target.value) })
                        }
                        className="w-24 font-mono tabular-nums"
                      />
                    </div>
                  </>
                ) : (
                  timeInput
                )}
              </div>
            </>
          )}

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {upcoming ? (
              <>
                <span className="font-medium text-foreground">
                  {m.schedules_upcoming()}
                </span>{' '}
                {upcoming.map((date) => formatRunDay(date)).join(' · ')}
              </>
            ) : (
              <span className="text-destructive">
                {m.schedules_cron_invalid()}
              </span>
            )}
          </p>

          {useCron ? (
            backToSimple && (
              <Button
                type="button"
                variant="link"
                className="h-auto self-start p-0"
                onClick={() => {
                  setSimple(backToSimple)
                  setUseCron(false)
                }}
              >
                {m.schedules_edit_simple()}
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="link"
              className="h-auto self-start p-0 text-muted-foreground"
              onClick={() => {
                // Start from what the simple form produces
                setRawCron(cronExpression)
                setUseCron(true)
              }}
            >
              {m.schedules_edit_cron()}
            </Button>
          )}
        </Section>

        {command === 'scrub' && (
          <Section step={++step} title={m.schedules_scrub_plan()}>
            <ScrubPlanPicker
              value={scrubOptions}
              onChange={setScrubOptions}
              plans={SCHEDULE_SCRUB_PLANS}
            />
          </Section>
        )}

        {command === 'sync' && (
          <Section
            step={++step}
            title={m.schedules_routine()}
            hint={m.schedules_routine_hint()}
          >
            <div className="divide-y rounded-lg border">
              <OptionRow
                id={fieldId('touch')}
                title={m.schedules_touch_before()}
                hint={m.schedules_touch_before_hint()}
                checked={touchBefore}
                onCheckedChange={setTouchBefore}
              />
              <OptionRow
                id={fieldId('pre-hash')}
                title={m.sync_pre_hash()}
                hint={m.sync_pre_hash_hint()}
                checked={preHash}
                onCheckedChange={setPreHash}
              />
              <OptionRow
                id={fieldId('scrub-after')}
                title={m.schedules_scrub_after()}
                hint={m.schedules_scrub_after_hint()}
                checked={scrubAfter}
                onCheckedChange={setScrubAfter}
              >
                <ScrubPlanPicker
                  value={scrubAfterOptions}
                  onChange={setScrubAfterOptions}
                  plans={SYNC_SCRUB_PLANS}
                />
              </OptionRow>
            </div>
          </Section>
        )}

        {command === 'sync' && (
          <Section step={++step} title={m.schedules_guard_title()}>
            <div className="rounded-lg border">
              <OptionRow
                id={fieldId('guard')}
                title={m.schedules_guard_switch()}
                hint={m.schedules_guard_hint()}
                checked={guard}
                onCheckedChange={switchGuard}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={fieldId('max-deleted')}>
                      {m.schedules_guard_max_deleted()}
                    </Label>
                    <Input
                      id={fieldId('max-deleted')}
                      type="number"
                      min={0}
                      value={maxDeletedFiles}
                      onChange={(e) => setMaxDeletedFiles(e.target.value)}
                      placeholder={m.schedules_guard_no_limit()}
                      aria-invalid={!isLimit(maxDeletedFiles) || undefined}
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={fieldId('max-updated')}>
                      {m.schedules_guard_max_updated()}
                    </Label>
                    <Input
                      id={fieldId('max-updated')}
                      type="number"
                      min={0}
                      value={maxUpdatedFiles}
                      onChange={(e) => setMaxUpdatedFiles(e.target.value)}
                      placeholder={m.schedules_guard_no_limit()}
                      aria-invalid={!isLimit(maxUpdatedFiles) || undefined}
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>
              </OptionRow>
            </div>
          </Section>
        )}

        <Section step={++step} title={m.schedules_name_optional()}>
          <Input
            id={fieldId('name')}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholderName}
            aria-label={m.schedules_name_optional()}
            aria-describedby={fieldId('name-hint')}
          />
          <p
            id={fieldId('name-hint')}
            className="-mt-1 text-sm text-muted-foreground"
          >
            {m.schedules_name_hint()}
          </p>
        </Section>
      </SheetBody>

      <SheetFooter className="px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" disabled={!isOptionsValid}>
          {schedule ? m.common_save() : m.schedules_create_new()}
        </Button>
      </SheetFooter>
    </form>
  )
}
