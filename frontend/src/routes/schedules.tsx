import type { Schedule, ScheduleOutcome, SnapRaidCommand } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Edit, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/Button'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import {
  DEFAULT_SCRUB_OPTIONS,
  getScrubPlanLabel,
  isValidScrubOptions,
  parseScrubArgs,
  type ScrubOptions,
  type ScrubPlan,
  ScrubPlanPicker,
  scrubArgs,
} from '../components/ScrubPlanPicker'
import { SegmentedControl } from '../components/SegmentedControl'
import { Select } from '../components/Select'
import {
  useConfig,
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useToggleSchedule,
  useUpdateSchedule,
} from '../hooks/queries'
import { getCommandLabel } from '../lib/commands'
import { formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/schedules')({
  component: SchedulesPage,
})

type ScheduleInput = Omit<
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

const OUTCOME_STYLES: Record<ScheduleOutcome['result'], string> = {
  ok: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-700',
  aborted: 'bg-gray-200 text-gray-700',
  incomplete: 'bg-gray-200 text-gray-700',
  skipped: 'bg-orange-100 text-orange-800',
}

const getOutcomeLabel = (result: ScheduleOutcome['result']): string => {
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

const getOutcomeDetail = (outcome: ScheduleOutcome): string | undefined => {
  switch (outcome.skipReason) {
    case 'job_running':
      return m.schedules_skip_job_running()
    case 'too_many_deleted':
      return m.schedules_skip_too_many_deleted({
        count: outcome.deletedFiles ?? 0,
      })
    case 'diff_failed':
      return m.schedules_skip_diff_failed({ error: outcome.error ?? '' })
    case 'recovery_in_progress':
      return m.schedules_skip_recovery()
    default:
      return outcome.error
  }
}

// Readable scrub args, e.g. "8%, older than 10 days"
const describeScrubArgs = (args: string[] | undefined) => {
  const options = parseScrubArgs(args)
  return options.plan === 'percent'
    ? m.schedules_scrub_percent_summary({
        percent: options.percent,
        days: options.olderThan,
      })
    : getScrubPlanLabel(options.plan)
}

// 2023-01-01 was a Sunday, cron counts weekdays from Sunday = 0
const weekdayName = (day: number) =>
  new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(
    new Date(2023, 0, 1 + day),
  )

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
const smallLabelClass = 'block text-xs font-medium text-gray-600 mb-1'

function SchedulesPage() {
  const { confirm, toast } = useFeedback()
  const { data: schedules = [], isLoading } = useSchedules()
  const { data: config } = useConfig()
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()
  const toggleSchedule = useToggleSchedule()

  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleCreate = async (schedule: ScheduleInput) => {
    try {
      await createSchedule.mutateAsync(schedule)
      setIsCreating(false)
      toast.success(m.schedules_created({ name: schedule.name }))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const handleUpdate = async (
    id: string,
    updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>,
  ) => {
    try {
      await updateSchedule.mutateAsync({ id, updates })
      setEditingId(null)
      toast.success(m.schedules_saved())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      message: m.schedules_delete_confirm(),
      confirmLabel: m.confirm_delete(),
      danger: true,
    })
    if (!confirmed) return
    try {
      await deleteSchedule.mutateAsync(id)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleSchedule.mutateAsync(id)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <PageLayout
      title={m.schedules_title()}
      actions={
        // The empty state has its own button, one is enough
        schedules.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
          >
            <Plus size={16} />
            {m.schedules_create_new()}
          </Button>
        )
      }
    >
      {isCreating && (
        <ScheduleForm
          configs={config?.snapraidConfigs || []}
          onSubmit={handleCreate}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {isLoading ? (
        <p className="text-gray-600">{m.common_loading()}</p>
      ) : schedules.length === 0 && !isCreating ? (
        <div className="ui-fade-in flex flex-col items-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Calendar size={24} />
          </div>
          <h3 className="font-semibold text-gray-900">
            {m.schedules_empty_title()}
          </h3>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {m.schedules_empty()}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCreating(true)}
            className="mt-5"
          >
            <Plus size={16} />
            {m.schedules_create_new()}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              configs={config?.snapraidConfigs || []}
              isEditing={editingId === schedule.id}
              onEdit={() => setEditingId(schedule.id)}
              onUpdate={(updates) => handleUpdate(schedule.id, updates)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(schedule.id)}
              onToggle={() => handleToggle(schedule.id)}
            />
          ))}
        </div>
      )}
    </PageLayout>
  )
}

interface ScheduleFormProps {
  schedule?: Schedule
  configs: Array<{ name: string; path: string }>
  onSubmit: (schedule: ScheduleInput) => void
  onCancel: () => void
}

function ScheduleForm({
  schedule,
  configs,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
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
  const isOptionsValid =
    command === 'scrub'
      ? isValidScrubOptions(scrubOptions)
      : command !== 'sync' ||
        ((!syncGuard ||
          (maxDeletedFiles.trim() !== '' &&
            Number.isInteger(maxDeletedValue) &&
            maxDeletedValue >= 0)) &&
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

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-xl font-semibold mb-4">
        {schedule ? m.schedules_edit_title() : m.schedules_new_title()}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {m.schedules_field_name()}
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={m.schedules_field_name_placeholder()}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="command"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {m.schedules_field_command()}
            </label>
            <Select
              id="command"
              value={command}
              onChange={setCommand}
              options={SCHEDULE_COMMANDS.map((cmd) => ({
                value: cmd,
                label: getCommandLabel(cmd),
              }))}
            />
          </div>

          <div>
            <label
              htmlFor="config"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {m.schedules_field_config()}
            </label>
            <Select
              id="config"
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
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncGuard}
                onChange={(e) => setSyncGuard(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                {m.schedules_sync_guard()}
              </span>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              {m.schedules_sync_guard_hint()}
            </p>
            {syncGuard && (
              <div className="mt-3 ml-6 max-w-48">
                <label
                  htmlFor="schedule-max-deleted"
                  className={smallLabelClass}
                >
                  {m.schedules_sync_guard_label()}
                </label>
                <input
                  id="schedule-max-deleted"
                  type="number"
                  min={0}
                  value={maxDeletedFiles}
                  onChange={(e) => setMaxDeletedFiles(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        )}

        {command === 'sync' && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div>
              <span className="block text-sm font-medium text-gray-700">
                {m.schedules_routine()}
              </span>
              <p className="text-xs text-gray-500">
                {m.schedules_routine_hint()}
              </p>
            </div>
            <label className="flex gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={touchBefore}
                onChange={(e) => setTouchBefore(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">
                  {m.schedules_touch_before()}
                </span>
                <span className="block text-xs text-gray-500">
                  {m.schedules_touch_before_hint()}
                </span>
              </span>
            </label>
            <label className="flex gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preHash}
                onChange={(e) => setPreHash(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">
                  {m.sync_pre_hash()}
                </span>
                <span className="block text-xs text-gray-500">
                  {m.sync_pre_hash_hint()}
                </span>
              </span>
            </label>
            <label className="flex gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scrubAfter}
                onChange={(e) => setScrubAfter(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">
                  {m.schedules_scrub_after()}
                </span>
                <span className="block text-xs text-gray-500">
                  {m.schedules_scrub_after_hint()}
                </span>
              </span>
            </label>
            {scrubAfter && (
              <div className="ml-6">
                <ScrubPlanPicker
                  value={scrubAfterOptions}
                  onChange={setScrubAfterOptions}
                  plans={SYNC_SCRUB_PLANS}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            {m.schedules_field_schedule()}
          </span>

          <div className="mb-3">
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
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset === p.id}
                  onClick={() => setPreset(p.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    preset === p.id
                      ? 'border-blue-500 bg-blue-50 font-medium text-blue-900'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.label()}
                </button>
              ))}
            </div>
          )}

          {scheduleType === 'cron' && (
            <div>
              <input
                id="schedule-raw-cron"
                type="text"
                value={rawCron}
                onChange={(e) => setRawCron(e.target.value)}
                required
                className={`${inputClass} font-mono`}
                aria-describedby="schedule-cron-help"
              />
              <p id="schedule-cron-help" className="mt-1 text-xs text-gray-500">
                {m.schedules_cron_help()}
              </p>
            </div>
          )}

          {scheduleType === 'custom' && (
            <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
              <div>
                <label htmlFor="schedule-frequency" className={smallLabelClass}>
                  {m.schedules_frequency()}
                </label>
                <Select
                  id="schedule-frequency"
                  size="sm"
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
                  <div>
                    <label
                      htmlFor="schedule-every-n-hours"
                      className={smallLabelClass}
                    >
                      {m.schedules_freq_hourly()}
                    </label>
                    <input
                      id="schedule-every-n-hours"
                      type="number"
                      min="1"
                      max="23"
                      value={everyNHours}
                      onChange={(e) => setEveryNHours(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="schedule-minute"
                      className={smallLabelClass}
                    >
                      {m.schedules_at_minute()}
                    </label>
                    <input
                      id="schedule-minute"
                      type="number"
                      min="0"
                      max="59"
                      value={minute}
                      onChange={(e) => setMinute(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-1">
                      <input
                        type="checkbox"
                        checked={useEveryHour}
                        onChange={(e) => setUseEveryHour(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      {m.schedules_every_hour()}
                    </label>
                    {!useEveryHour && (
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={hour}
                        onChange={(e) => setHour(Number(e.target.value))}
                        className={inputClass}
                        placeholder={m.schedules_hour()}
                        aria-label={m.schedules_hour()}
                      />
                    )}
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-1">
                      <input
                        type="checkbox"
                        checked={useEveryMinute}
                        onChange={(e) => setUseEveryMinute(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      {m.schedules_every_n_minutes()}
                    </label>
                    {useEveryMinute ? (
                      <input
                        type="number"
                        min="1"
                        max="59"
                        value={everyNMinutes}
                        onChange={(e) =>
                          setEveryNMinutes(Number(e.target.value))
                        }
                        className={inputClass}
                        aria-label={m.schedules_every_n_minutes()}
                      />
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={minute}
                        onChange={(e) => setMinute(Number(e.target.value))}
                        className={inputClass}
                        placeholder={m.schedules_minute()}
                        aria-label={m.schedules_minute()}
                      />
                    )}
                  </div>
                </div>
              )}

              {customFrequency === 'weekly' && (
                <div>
                  <label
                    htmlFor="schedule-day-of-week"
                    className={smallLabelClass}
                  >
                    {m.schedules_day_of_week()}
                  </label>
                  <Select
                    id="schedule-day-of-week"
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
                <div>
                  <label
                    htmlFor="schedule-day-of-month"
                    className={smallLabelClass}
                  >
                    {m.schedules_day_of_month()}
                  </label>
                  <input
                    id="schedule-day-of-month"
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          )}

          {scheduleType !== 'cron' && (
            <p className="mt-3 text-xs text-gray-500">
              {m.schedules_mode_cron()}:{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                {cronExpression}
              </code>
            </p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              {m.schedules_field_enabled()}
            </span>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="secondary" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <Button type="submit" disabled={!isOptionsValid}>
            {schedule ? m.common_save() : m.common_create()}
          </Button>
        </div>
      </form>
    </div>
  )
}

interface ScheduleCardProps {
  schedule: Schedule
  configs: Array<{ name: string; path: string }>
  isEditing: boolean
  onEdit: () => void
  onUpdate: (updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>) => void
  onCancelEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

function ScheduleCard({
  schedule,
  configs,
  isEditing,
  onEdit,
  onUpdate,
  onCancelEdit,
  onDelete,
  onToggle,
}: ScheduleCardProps) {
  const configName =
    configs.find((c) => c.path === schedule.configPath)?.name ||
    schedule.configPath

  if (isEditing) {
    return (
      <ScheduleForm
        schedule={schedule}
        configs={configs}
        onSubmit={onUpdate}
        onCancel={onCancelEdit}
      />
    )
  }

  const formatRun = (date: string) =>
    `${formatRelativeTime(date, getLocale())} (${new Date(date).toLocaleString()})`

  return (
    <div
      className={`bg-white rounded-lg shadow p-6 ${!schedule.enabled ? 'opacity-60' : ''}`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            {schedule.name}
            {!schedule.enabled && (
              <span className="text-xs px-2 py-0.5 bg-gray-500 text-white rounded">
                {m.schedules_disabled()}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-gray-600">
            <strong className="text-gray-700">
              {m.schedules_field_command()}:
            </strong>
            <span>
              {schedule.command === 'sync' && schedule.touchBefore && (
                <>{m.commands_touch()} → </>
              )}
              {getCommandLabel(schedule.command)}
              {schedule.command === 'sync' && schedule.args?.includes('-h') && (
                <span className="text-gray-500">
                  {' · '}
                  {m.sync_pre_hash()}
                </span>
              )}
              {schedule.command === 'scrub' && (
                <span className="text-gray-500">
                  {' · '}
                  {getScrubPlanLabel(parseScrubArgs(schedule.args).plan)}
                  {schedule.args && schedule.args.length > 0 && (
                    <code className="ml-2 bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                      {schedule.args.join(' ')}
                    </code>
                  )}
                </span>
              )}
              {schedule.command === 'sync' && schedule.scrubAfter && (
                <>
                  {' → '}
                  {m.commands_scrub()}
                  <span className="text-gray-500">
                    {' · '}
                    {describeScrubArgs(schedule.scrubAfter)}
                  </span>
                </>
              )}
            </span>

            {schedule.command === 'sync' && (
              <>
                <strong className="text-gray-700">
                  {m.schedules_field_guard()}:
                </strong>
                {schedule.maxDeletedFiles != null ? (
                  <span>
                    {m.schedules_guard_summary({
                      count: schedule.maxDeletedFiles,
                    })}
                  </span>
                ) : (
                  <span className="text-orange-700">
                    {m.schedules_guard_off()}
                  </span>
                )}
              </>
            )}

            <strong className="text-gray-700">
              {m.schedules_field_config()}:
            </strong>
            <span className="truncate">{configName}</span>

            <strong className="text-gray-700">
              {m.schedules_field_schedule()}:
            </strong>
            <span>
              <code className="bg-gray-100 px-2 py-0.5 rounded">
                {schedule.cronExpression}
              </code>
            </span>

            {schedule.enabled && schedule.nextRun && (
              <>
                <strong className="text-gray-700">
                  {m.schedules_next_run()}:
                </strong>
                <span>{formatRun(schedule.nextRun)}</span>
              </>
            )}

            {schedule.lastRun && (
              <>
                <strong className="text-gray-700">
                  {m.schedules_last_run()}:
                </strong>
                <span>{formatRun(schedule.lastRun)}</span>
              </>
            )}

            {schedule.lastOutcome && (
              <>
                <strong className="text-gray-700">
                  {m.schedules_last_outcome()}:
                </strong>
                <span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[schedule.lastOutcome.result]}`}
                    title={new Date(
                      schedule.lastOutcome.timestamp,
                    ).toLocaleString()}
                  >
                    {getOutcomeLabel(schedule.lastOutcome.result)}
                  </span>
                  {schedule.lastOutcome.steps && (
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {schedule.lastOutcome.steps.map((step) => (
                        <span
                          key={step.command}
                          className={`rounded px-1.5 py-0.5 text-xs ${OUTCOME_STYLES[step.result]}`}
                        >
                          {getCommandLabel(step.command)}:{' '}
                          {getOutcomeLabel(step.result)}
                        </span>
                      ))}
                    </span>
                  )}
                  {getOutcomeDetail(schedule.lastOutcome) && (
                    <span className="ml-2">
                      {getOutcomeDetail(schedule.lastOutcome)}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <Button
            onClick={onToggle}
            title={
              schedule.enabled ? m.schedules_disable() : m.schedules_enable()
            }
            aria-label={
              schedule.enabled ? m.schedules_disable() : m.schedules_enable()
            }
            variant="ghost"
            size="icon"
          >
            {schedule.enabled ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
          <Button
            onClick={onEdit}
            title={m.common_edit()}
            aria-label={m.common_edit()}
            variant="ghost"
            size="icon"
          >
            <Edit className="w-5 h-5" />
          </Button>
          <Button
            onClick={onDelete}
            title={m.common_delete()}
            aria-label={m.common_delete()}
            variant="ghostDanger"
            size="icon"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
