import type { Schedule, SnapRaidCommand } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Edit, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import {
  useConfig,
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useToggleSchedule,
  useUpdateSchedule,
} from '../hooks/queries'
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

const getCommandLabel = (command: SnapRaidCommand): string => {
  switch (command) {
    case 'sync':
      return m.commands_sync()
    case 'scrub':
      return m.commands_scrub()
    case 'status':
      return m.commands_status()
    case 'diff':
      return m.commands_diff()
    case 'check':
      return m.commands_check()
    case 'smart':
      return m.commands_smart()
    default:
      return command
  }
}

// 2023-01-01 was a Sunday, cron counts weekdays from Sunday = 0
const weekdayName = (day: number) =>
  new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(
    new Date(2023, 0, 1 + day),
  )

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500'
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
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          {m.schedules_create_new()}
        </button>
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
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-xl text-gray-600">{m.schedules_empty()}</p>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="mt-6 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
          >
            {m.schedules_create_new()}
          </button>
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
    onSubmit({
      name,
      command,
      configPath,
      cronExpression,
      enabled,
    })
  }

  const modeButton = (mode: typeof scheduleType, label: string) => (
    <button
      type="button"
      onClick={() => {
        // Start raw editing from what the other modes currently produce
        if (mode === 'cron') setRawCron(cronExpression)
        setScheduleType(mode)
      }}
      className={`px-4 py-2 rounded-lg transition-colors ${
        scheduleType === mode
          ? 'bg-cyan-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )

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
            <select
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value as SnapRaidCommand)}
              className={inputClass}
            >
              {SCHEDULE_COMMANDS.map((cmd) => (
                <option key={cmd} value={cmd}>
                  {getCommandLabel(cmd)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="config"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {m.schedules_field_config()}
            </label>
            <select
              id="config"
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              className={inputClass}
            >
              {configs.map((cfg) => (
                <option key={cfg.path} value={cfg.path}>
                  {cfg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            {m.schedules_field_schedule()}
          </span>

          <div className="flex flex-wrap gap-2 mb-3">
            {modeButton('preset', m.schedules_mode_presets())}
            {modeButton('custom', m.schedules_mode_custom())}
            {modeButton('cron', m.schedules_mode_cron())}
          </div>

          {scheduleType === 'preset' && (
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    preset === p.id
                      ? 'bg-cyan-100 border-2 border-cyan-600 text-cyan-900'
                      : 'bg-gray-50 border border-gray-300 text-gray-700 hover:bg-gray-100'
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
                <select
                  id="schedule-frequency"
                  value={customFrequency}
                  onChange={(e) =>
                    setCustomFrequency(e.target.value as typeof customFrequency)
                  }
                  className={`${inputClass} text-sm`}
                >
                  <option value="hourly">{m.schedules_freq_hourly()}</option>
                  <option value="daily">{m.schedules_freq_daily()}</option>
                  <option value="weekly">{m.schedules_freq_weekly()}</option>
                  <option value="monthly">{m.schedules_freq_monthly()}</option>
                </select>
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
                        className="w-4 h-4 text-cyan-600 border-gray-300 rounded"
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
                        className="w-4 h-4 text-cyan-600 border-gray-300 rounded"
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
                  <select
                    id="schedule-day-of-week"
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className={inputClass}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <option key={day} value={day}>
                        {weekdayName(day)}
                      </option>
                    ))}
                  </select>
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
              className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
            />
            <span className="text-sm font-medium text-gray-700">
              {m.schedules_field_enabled()}
            </span>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {m.common_cancel()}
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
          >
            {schedule ? m.common_save() : m.common_create()}
          </button>
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
            <span>{getCommandLabel(schedule.command)}</span>

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
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggle}
            title={
              schedule.enabled ? m.schedules_disable() : m.schedules_enable()
            }
            aria-label={
              schedule.enabled ? m.schedules_disable() : m.schedules_enable()
            }
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {schedule.enabled ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            title={m.common_edit()}
            aria-label={m.common_edit()}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={m.common_delete()}
            aria-label={m.common_delete()}
            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
