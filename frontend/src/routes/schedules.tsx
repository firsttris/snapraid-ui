import type { Schedule } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { SAVE_BAR_SPACE } from '../components/SaveBar'
import {
  ScheduleForm,
  type ScheduleInput,
} from '../components/schedules/ScheduleForm'
import { ScheduleRow } from '../components/schedules/ScheduleRow'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import {
  useConfig,
  useCreateSchedule,
  useDeleteSchedule,
  useRunSchedule,
  useSchedules,
  useToggleSchedule,
  useUpdateSchedule,
} from '../hooks/queries'
import { useJob } from '../hooks/useJob'
import { formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/schedules')({
  component: SchedulesPage,
})

function SchedulesPage() {
  const { confirm, toast } = useFeedback()
  const { data: schedules = [], isLoading } = useSchedules()
  const { data: config } = useConfig()
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()
  const toggleSchedule = useToggleSchedule()
  const runSchedule = useRunSchedule()
  const job = useJob()

  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // One form at a time, each brings its own save bar
  const startCreating = () => {
    setEditingId(null)
    setIsCreating(true)
  }

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

  // Runs like at its time, its output and result show as for a timed run
  const handleRun = async (id: string, name: string) => {
    try {
      await runSchedule.mutateAsync(id)
      toast.success(m.schedules_run_started({ name }))
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

  const configs = config?.snapraidConfigs || []
  const active = schedules.filter((s) => s.enabled)
  const nextRun = active
    .map((s) => s.nextRun)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const isFormOpen = isCreating || editingId !== null

  return (
    <PageLayout
      title={m.schedules_title()}
      description={
        schedules.length > 0 && (
          <>
            {m.schedules_summary_active({ count: active.length })}
            {nextRun && (
              <>
                {' · '}
                {m.schedules_summary_next({
                  when: formatRelativeTime(nextRun, getLocale()),
                })}
              </>
            )}
          </>
        )
      }
      actions={
        // The empty state has its own button, one is enough
        schedules.length > 0 && (
          <Button onClick={startCreating} disabled={isCreating}>
            <Plus />
            {m.schedules_create_new()}
          </Button>
        )
      }
    >
      {isCreating && (
        <ScheduleForm
          configs={configs}
          onSubmit={handleCreate}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{m.common_loading()}</p>
      ) : schedules.length === 0 ? (
        !isCreating && (
          <Card className="ui-fade-in items-center gap-0 border-dashed px-6 py-10 text-center shadow-none">
            <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Calendar className="size-6" />
            </div>
            <h3 className="text-base font-semibold">
              {m.schedules_empty_title()}
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {m.schedules_empty()}
            </p>
            <Button onClick={startCreating} className="mt-5">
              <Plus />
              {m.schedules_create_new()}
            </Button>
          </Card>
        )
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {schedules.map((schedule) =>
            editingId === schedule.id ? (
              <ScheduleForm
                key={schedule.id}
                embedded
                schedule={schedule}
                configs={configs}
                onSubmit={(updates) => handleUpdate(schedule.id, updates)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                configName={
                  configs.find((c) => c.path === schedule.configPath)?.name ||
                  schedule.configPath
                }
                onEdit={() => {
                  setIsCreating(false)
                  setEditingId(schedule.id)
                }}
                onDelete={() => handleDelete(schedule.id)}
                onToggle={() => handleToggle(schedule.id)}
                onRun={() => handleRun(schedule.id, schedule.name)}
                runDisabled={job.isRunning || runSchedule.isPending}
              />
            ),
          )}
        </Card>
      )}

      {/* Room for the save bar, so the end of the form stays reachable */}
      {isFormOpen && <div aria-hidden className={`-mt-6 ${SAVE_BAR_SPACE}`} />}
    </PageLayout>
  )
}
