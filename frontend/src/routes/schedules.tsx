import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useToggleSchedule, useConfig } from '../hooks/queries'
import type { Schedule, SnapRaidCommand } from '@shared/types'
import { Calendar, Play, Pause, Edit, Trash2 } from 'lucide-react'

export const Route = createFileRoute('/schedules')({
  component: SchedulesPage,
})

function SchedulesPage() {
  const { data: schedules = [], isLoading } = useSchedules()
  const { data: config } = useConfig()
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()
  const toggleSchedule = useToggleSchedule()

  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleCreate = async (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>) => {
    try {
      await createSchedule.mutateAsync(schedule)
      setIsCreating(false)
    } catch (error) {
      console.error('Failed to create schedule:', error)
    }
  }

  const handleUpdate = async (id: string, updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>) => {
    try {
      await updateSchedule.mutateAsync({ id, updates })
      setEditingId(null)
    } catch (error) {
      console.error('Failed to update schedule:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return
    try {
      await deleteSchedule.mutateAsync(id)
    } catch (error) {
      console.error('Failed to delete schedule:', error)
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleSchedule.mutateAsync(id)
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">Schedules</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <p className="text-gray-600">Loading...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar className="w-8 h-8" />
            Scheduled Jobs
          </h1>
          <button 
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Schedule
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {isCreating && (
            <ScheduleForm
              configs={config?.snapraidConfigs || []}
              onSubmit={handleCreate}
              onCancel={() => setIsCreating(false)}
            />
          )}

          {schedules.length === 0 && !isCreating ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-xl text-gray-600">
                No schedules configured yet. Create one to automate your SnapRAID tasks.
              </p>
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
        </div>
      </main>
    </div>
  )
}

interface ScheduleFormProps {
  schedule?: Schedule
  configs: Array<{ name: string; path: string }>
  onSubmit: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>) => void
  onCancel: () => void
}

function ScheduleForm({ schedule, configs, onSubmit, onCancel }: ScheduleFormProps) {
  const [name, setName] = useState(schedule?.name || '')
  const [command, setCommand] = useState<SnapRaidCommand>(schedule?.command || 'sync')
  const [configPath, setConfigPath] = useState(schedule?.configPath || configs[0]?.path || '')
  const [cronExpression, setCronExpression] = useState(schedule?.cronExpression || '0 2 * * *')
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true)

  const commands: SnapRaidCommand[] = ['sync', 'scrub', 'status', 'diff', 'check', 'smart']

  const cronPresets = [
    { label: 'Daily 2 AM', value: '0 2 * * *' },
    { label: 'Weekly Sunday', value: '0 2 * * 0' },
    { label: 'Monthly 1st', value: '0 2 1 * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
  ]

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

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-xl font-semibold mb-4">{schedule ? 'Edit Schedule' : 'Create New Schedule'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Daily Sync"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label htmlFor="command" className="block text-sm font-medium text-gray-700 mb-2">
            Command
          </label>
          <select
            id="command"
            value={command}
            onChange={(e) => setCommand(e.target.value as SnapRaidCommand)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {commands.map((cmd) => (
              <option key={cmd} value={cmd}>{cmd}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="config" className="block text-sm font-medium text-gray-700 mb-2">
            Configuration
          </label>
          <select
            id="config"
            value={configPath}
            onChange={(e) => setConfigPath(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {configs.map((cfg) => (
              <option key={cfg.path} value={cfg.path}>{cfg.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cron" className="block text-sm font-medium text-gray-700 mb-2">
            Schedule
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {cronPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setCronExpression(preset.value)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  cronExpression === preset.value 
                    ? 'bg-cyan-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            id="cron"
            type="text"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            required
            placeholder="0 2 * * *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <p className="text-sm text-gray-500 mt-1">
            Cron format: minute hour day month weekday (e.g., 0 2 * * * = daily at 2 AM)
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
            />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <button 
            type="button" 
            onClick={onCancel} 
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
          >
            {schedule ? 'Save' : 'Create'}
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

function ScheduleCard({ schedule, configs, isEditing, onEdit, onUpdate, onCancelEdit, onDelete, onToggle }: ScheduleCardProps) {
  const configName = configs.find(c => c.path === schedule.configPath)?.name || schedule.configPath

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

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${!schedule.enabled ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            {schedule.name}
            {!schedule.enabled && (
              <span className="text-xs px-2 py-0.5 bg-gray-500 text-white rounded">
                Disabled
              </span>
            )}
          </h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-gray-600">
            <strong className="text-gray-700">Command:</strong>
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{schedule.command}</span>
            
            <strong className="text-gray-700">Config:</strong>
            <span>{configName}</span>
            
            <strong className="text-gray-700">Schedule:</strong>
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{schedule.cronExpression}</span>
            
            {schedule.nextRun && (
              <>
                <strong className="text-gray-700">Next Run:</strong>
                <span>{new Date(schedule.nextRun).toLocaleString()}</span>
              </>
            )}
            
            {schedule.lastRun && (
              <>
                <strong className="text-gray-700">Last Run:</strong>
                <span>{new Date(schedule.lastRun).toLocaleString()}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={onToggle}
            title={schedule.enabled ? 'Disable' : 'Enable'}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {schedule.enabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button 
            onClick={onEdit}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button 
            onClick={onDelete}
            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
