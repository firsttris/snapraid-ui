import type { Schedule, SnapRaidCommand } from '@shared/types'
import { type ReactNode, useId, useState } from 'react'
import { getCommandLabel } from '../../lib/commands'
import { cn } from '../../lib/utils'
import * as m from '../../paraglide/messages'
import { SaveBar } from '../SaveBar'
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
import { Card } from '../ui/card'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { weekdayName } from './scheduleText'

export type ScheduleInput = Omit<
  Schedule,
  'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'
>

const SCHEDULE_COMMANDS: SnapRaidCommand[] = [
  'sync',
  'scrub',
  'status',
  'diff',
  'check',
  'smart',
]

const PRESETS = [
  { id: 'daily', cron: '0 2 * * *', label: m.schedules_preset_daily_2am },
  {
    id: 'weekly',
    cron: '0 2 * * 0',
    label: m.schedules_preset_weekly_sunday,
  },
  { id: 'monthly', cron: '0 2 1 * *', label: m.schedules_preset_monthly },
  { id: 'every6h', cron: '0 */6 * * *', label: m.schedules_preset_every_6h },
] as const

type PresetId = (typeof PRESETS)[number]['id']

// Repairs follow a scrub that found errors, so scrub -p bad is not a schedule plan
const SCHEDULE_SCRUB_PLANS: ScrubPlan[] = ['default', 'percent', 'new', 'full']

// Scrub after a sync: the default checks the oldest 8%, new keeps up with fresh data
const SYNC_SCRUB_PLANS: ScrubPlan[] = ['default', 'percent', 'new']

// Default for new sync schedules: skip when more files were deleted than this
const DEFAULT_MAX_DELETED_FILES = 50

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

interface ScheduleFormProps {
  schedule?: Schedule
  configs: Array<{ name: string; path: string }>
  onSubmit: (schedule: ScheduleInput) => void
  onCancel: () => void
  // Inside the schedule list card, without a card of its own
  embedded?: boolean
}

export const ScheduleForm = ({
  schedule,
  configs,
  onSubmit,
  onCancel,
  embedded = false,
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
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true)
  const [scrubOptions, setScrubOptions] = useState<ScrubOptions>(() =>
    parseScrubArgs(schedule?.command === 'scrub' ? schedule.args : []),
  )
  const [preHash, setPreHash] = useState(
    schedule?.command === 'sync' && !!schedule.args?.includes('-h'),
  )
  const [syncGuard, setSyncGuard] = useState(
    schedule ? schedule.maxDeletedFiles != null : true,
  )
  const [maxDeletedFiles, setMaxDeletedFiles] = useState(
    String(schedule?.maxDeletedFiles ?? DEFAULT_MAX_DELETED_FILES),
  )
  // New sync schedules suggest the full nightly routine
  const [touchBefore, setTouchBefore] = useState(
    schedule ? !!schedule.touchBefore : true,
  )
  const [scrubAfter, setScrubAfter] = useState(
    schedule ? !!schedule.scrubAfter : true,
  )
  const [scrubAfterOptions, setScrubAfterOptions] = useState<ScrubOptions>(
    () =>
      schedule?.scrubAfter
        ? parseScrubArgs(schedule.scrubAfter)
        : DEFAULT_SCRUB_OPTIONS,
  )
  const maxDeletedValue = Number(maxDeletedFiles)
  const isGuardValid =
    !syncGuard ||
    (maxDeletedFiles.trim() !== '' &&
      Number.isInteger(maxDeletedValue) &&
      maxDeletedValue >= 0)
  const isOptionsValid =
    command === 'scrub'
      ? isValidScrubOptions(scrubOptions)
      : command !== 'sync' ||
        (isGuardValid &&
          (!scrubAfter || isValidScrubOptions(scrubAfterOptions)))

  // An existing schedule opens on its matching preset, or as a raw cron expression,
  // so saving other fields never changes when it runs
  const existingPreset = PRESETS.find(
    (p) => p.cron === schedule?.cronExpression,
  )
  const [scheduleType, setScheduleType] = useState<
    'preset' | 'custom' | 'cron'
  >(schedule && !existingPreset ? 'cron' : 'preset')
  const [preset, setPreset] = useState<PresetId>(existingPreset?.id ?? 'daily')
  const [rawCron, setRawCron] = useState(
    schedule?.cronExpression ?? PRESETS[0].cron,
  )
  const [customFrequency, setCustomFrequency] = useState<
    'hourly' | 'daily' | 'weekly' | 'monthly'
  >('daily')
  const [hour, setHour] = useState(2)
  const [minute, setMinute] = useState(0)
  const [dayOfWeek, setDayOfWeek] = useState(0) // Sunday
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [everyNHours, setEveryNHours] = useState(6)
  const [everyNMinutes, setEveryNMinutes] = useState(30)
  const [useEveryHour, setUseEveryHour] = useState(false)
  const [useEveryMinute, setUseEveryMinute] = useState(false)

  // Generate cron expression based on settings
  const generateCronExpression = (): string => {
    if (scheduleType === 'cron') return rawCron.trim()
    if (scheduleType === 'preset') {
      return PRESETS.find((p) => p.id === preset)?.cron ?? PRESETS[0].cron
    }

    const minutePart = useEveryMinute ? `*/${everyNMinutes}` : minute.toString()
    const hourPart = useEveryHour ? '*' : hour.toString()

    switch (customFrequency) {
      case 'hourly':
        return `${minute} */${everyNHours} * * *`
      case 'daily':
        return `${minutePart} ${hourPart} * * *`
      case 'weekly':
        return `${minutePart} ${hourPart} * * ${dayOfWeek}`
      case 'monthly':
        return `${minutePart} ${hourPart} ${dayOfMonth} * *`
      default:
        return PRESETS[0].cron
    }
  }

  const cronExpression = generateCronExpression()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOptionsValid) return
    onSubmit({
      name,
      command,
      configPath,
      cronExpression,
      enabled,
      args:
        command === 'scrub'
          ? scrubArgs(scrubOptions)
          : command === 'sync' && preHash
            ? ['-h']
            : [],
      maxDeletedFiles: command === 'sync' && syncGuard ? maxDeletedValue : null,
      touchBefore: command === 'sync' && touchBefore,
      scrubAfter:
        command === 'sync' && scrubAfter ? scrubArgs(scrubAfterOptions) : null,
    })
  }

  const changeMode = (mode: typeof scheduleType) => {
    // Start raw editing from what the other modes currently produce
    if (mode === 'cron') setRawCron(cronExpression)
    setScheduleType(mode)
  }

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">
          {schedule ? m.schedules_edit_title() : m.schedules_new_title()}
        </h2>
        {schedule && (
          <p className="text-sm text-muted-foreground">{schedule.name}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={fieldId('name')}>{m.schedules_field_name()}</Label>
        <Input
          id={fieldId('name')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={m.schedules_field_name_placeholder()}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId('command')}>
            {m.schedules_field_command()}
          </Label>
          <Select
            id={fieldId('command')}
            value={command}
            onChange={setCommand}
            options={SCHEDULE_COMMANDS.map((cmd) => ({
              value: cmd,
              label: getCommandLabel(cmd),
            }))}
          />
        </div>

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
      </div>

      {command === 'scrub' && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {m.schedules_scrub_plan()}
          </span>
          <ScrubPlanPicker
            value={scrubOptions}
            onChange={setScrubOptions}
            plans={SCHEDULE_SCRUB_PLANS}
          />
        </div>
      )}

      {command === 'sync' && (
        <div className="divide-y rounded-lg border">
          <OptionRow
            id={fieldId('guard')}
            title={m.schedules_sync_guard()}
            hint={m.schedules_sync_guard_hint()}
            checked={syncGuard}
            onCheckedChange={setSyncGuard}
          >
            <div className="flex max-w-48 flex-col gap-2">
              <Label htmlFor={fieldId('max-deleted')}>
                {m.schedules_sync_guard_label()}
              </Label>
              <Input
                id={fieldId('max-deleted')}
                type="number"
                min={0}
                value={maxDeletedFiles}
                onChange={(e) => setMaxDeletedFiles(e.target.value)}
                aria-invalid={!isGuardValid || undefined}
                className="font-mono tabular-nums"
              />
            </div>
          </OptionRow>
        </div>
      )}

      {command === 'sync' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium">{m.schedules_routine()}</h3>
            <p className="text-sm text-muted-foreground">
              {m.schedules_routine_hint()}
            </p>
          </div>
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
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">
          {m.schedules_field_schedule()}
        </span>

        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            options={[
              { value: 'preset', label: m.schedules_mode_presets() },
              { value: 'custom', label: m.schedules_mode_custom() },
              { value: 'cron', label: m.schedules_mode_cron() },
            ]}
            value={scheduleType}
            onChange={changeMode}
          />
        </div>

        {scheduleType === 'preset' && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                aria-pressed={preset === p.id}
                onClick={() => setPreset(p.id)}
                className={cn(
                  'h-auto min-h-9 whitespace-normal py-2 font-normal',
                  preset === p.id &&
                    'border-primary bg-accent font-medium ring-1 ring-primary',
                )}
              >
                {p.label()}
              </Button>
            ))}
          </div>
        )}

        {scheduleType === 'cron' && (
          <div className="flex flex-col gap-2">
            <Input
              id={fieldId('raw-cron')}
              type="text"
              value={rawCron}
              onChange={(e) => setRawCron(e.target.value)}
              required
              className="font-mono"
              aria-label={m.schedules_mode_cron()}
              aria-describedby={fieldId('cron-help')}
            />
            <p
              id={fieldId('cron-help')}
              className="text-sm text-muted-foreground"
            >
              {m.schedules_cron_help()}
            </p>
          </div>
        )}

        {scheduleType === 'custom' && (
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={fieldId('frequency')}>
                {m.schedules_frequency()}
              </Label>
              <Select
                id={fieldId('frequency')}
                value={customFrequency}
                onChange={setCustomFrequency}
                options={[
                  { value: 'hourly', label: m.schedules_freq_hourly() },
                  { value: 'daily', label: m.schedules_freq_daily() },
                  { value: 'weekly', label: m.schedules_freq_weekly() },
                  { value: 'monthly', label: m.schedules_freq_monthly() },
                ]}
              />
            </div>

            {customFrequency === 'hourly' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={fieldId('every-n-hours')}>
                    {m.schedules_freq_hourly()}
                  </Label>
                  <Input
                    id={fieldId('every-n-hours')}
                    type="number"
                    min="1"
                    max="23"
                    value={everyNHours}
                    onChange={(e) => setEveryNHours(Number(e.target.value))}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={fieldId('minute')}>
                    {m.schedules_at_minute()}
                  </Label>
                  <Input
                    id={fieldId('minute')}
                    type="number"
                    min="0"
                    max="59"
                    value={minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={fieldId('every-hour')}>
                    <Checkbox
                      id={fieldId('every-hour')}
                      checked={useEveryHour}
                      onCheckedChange={(v) => setUseEveryHour(v === true)}
                    />
                    {m.schedules_every_hour()}
                  </Label>
                  {!useEveryHour && (
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                      className="font-mono tabular-nums"
                      placeholder={m.schedules_hour()}
                      aria-label={m.schedules_hour()}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={fieldId('every-minute')}>
                    <Checkbox
                      id={fieldId('every-minute')}
                      checked={useEveryMinute}
                      onCheckedChange={(v) => setUseEveryMinute(v === true)}
                    />
                    {m.schedules_every_n_minutes()}
                  </Label>
                  {useEveryMinute ? (
                    <Input
                      type="number"
                      min="1"
                      max="59"
                      value={everyNMinutes}
                      onChange={(e) => setEveryNMinutes(Number(e.target.value))}
                      className="font-mono tabular-nums"
                      aria-label={m.schedules_every_n_minutes()}
                    />
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={minute}
                      onChange={(e) => setMinute(Number(e.target.value))}
                      className="font-mono tabular-nums"
                      placeholder={m.schedules_minute()}
                      aria-label={m.schedules_minute()}
                    />
                  )}
                </div>
              </div>
            )}

            {customFrequency === 'weekly' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('day-of-week')}>
                  {m.schedules_day_of_week()}
                </Label>
                <Select
                  id={fieldId('day-of-week')}
                  value={dayOfWeek}
                  onChange={setDayOfWeek}
                  options={[0, 1, 2, 3, 4, 5, 6].map((day) => ({
                    value: day,
                    label: weekdayName(day),
                  }))}
                />
              </div>
            )}

            {customFrequency === 'monthly' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('day-of-month')}>
                  {m.schedules_day_of_month()}
                </Label>
                <Input
                  id={fieldId('day-of-month')}
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className="font-mono tabular-nums"
                />
              </div>
            )}
          </div>
        )}

        {scheduleType !== 'cron' && (
          <p className="text-sm text-muted-foreground">
            {m.schedules_mode_cron()}:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {cronExpression}
            </code>
          </p>
        )}
      </div>

      <div className="rounded-lg border">
        <OptionRow
          id={fieldId('enabled')}
          title={m.schedules_field_enabled()}
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <SaveBar>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" disabled={!isOptionsValid}>
          {schedule ? m.common_save() : m.common_create()}
        </Button>
      </SaveBar>
    </form>
  )

  return embedded ? (
    <div className="bg-muted/30 p-4 sm:p-6">{form}</div>
  ) : (
    <Card className="px-4 sm:px-6">{form}</Card>
  )
}
