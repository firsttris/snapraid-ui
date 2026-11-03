import type { Schedule } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import {
  ScheduleForm,
  type ScheduleInput,
} from '../components/schedules/ScheduleForm'
import { ScheduleRow } from '../components/schedules/ScheduleRow'
import { ScheduleWeek } from '../components/schedules/ScheduleWeek'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Sheet, SheetContent } from '../components/ui/sheet'
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

  // The panel keeps its schedule while it slides out; each opening starts a fresh form
  const [form, setForm] = useState({
    open: false,
    id: null as string | null,
    count: 0,
  })
  const openForm = (id: string | null) =>
    setForm((current) => ({ open: true, id, count: current.count + 1 }))
  const closeForm = () => setForm((current) => ({ ...current, open: false }))

  const startCreating = () => {
    openForm(null)
  }

  const handleCreate = async (schedule: ScheduleInput) => {
    try {
      await createSchedule.mutateAsync(schedule)
      closeForm()
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
      closeForm()
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

  // Skips the next timed run once, or takes that back
  const handleSkipNext = async (schedule: Schedule) => {
    const skipNext = !schedule.skipNext
    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        updates: { skipNext },
      })
      toast.success(
        skipNext
          ? m.schedules_skip_next_set({ name: schedule.name })
          : m.schedules_skip_next_cleared({ name: schedule.name }),
      )
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
  const next = active
    .filter((s) => s.nextRun)
    .sort(
      (a, b) =>
        new Date(a.nextRun as string).getTime() -
        new Date(b.nextRun as string).getTime(),
    )[0]
  const editing = schedules.find((s) => s.id === form.id)

  return (
    <PageLayout
      title={m.schedules()}
      description={
        schedules.length > 0 && (
          <>
            {m.schedules_summary_active({ count: active.length })}
            {next?.nextRun && (
              <>
                {' · '}
                {m.schedules_summary_next({
                  when: formatRelativeTime(next.nextRun, getLocale()),
                  name: next.name,
                })}
              </>
            )}
          </>
        )
      }
      actions={
        // The empty state has its own button, one is enough
        schedules.length > 0 && (
          <Button onClick={startCreating} disabled={form.open}>
            <Plus />
            {m.schedules_create_new()}
          </Button>
        )
      }
    >
      <Sheet open={form.open} onOpenChange={(open) => !open && closeForm()}>
        <SheetContent className="w-full gap-0 sm:max-w-xl">
          <ScheduleForm
            // A fresh form for each schedule
            key={form.count}
            schedule={editing}
            configs={configs}
            onSubmit={(input) =>
              editing ? handleUpdate(editing.id, input) : handleCreate(input)
            }
            onCancel={closeForm}
          />
        </SheetContent>
      </Sheet>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{m.common_loading()}</p>
      ) : schedules.length === 0 ? (
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
      ) : (
        <>
          <ScheduleWeek schedules={schedules} />
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {schedules.map((schedule) => {
              const configName = configs.find(
                (c) => c.path === schedule.configPath,
              )?.name
              return (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  // The array only matters when there is more than one, or it is gone
                  configName={
                    configs.length > 1 || !configName
                      ? configName || schedule.configPath
                      : undefined
                  }
                  onEdit={() => openForm(schedule.id)}
                  onDelete={() => handleDelete(schedule.id)}
                  onToggle={() => handleToggle(schedule.id)}
                  onRun={() => handleRun(schedule.id, schedule.name)}
                  onSkipNext={() => handleSkipNext(schedule)}
                  runDisabled={job.isRunning || runSchedule.isPending}
                />
              )
            })}
          </Card>
        </>
      )}
    </PageLayout>
  )
}
