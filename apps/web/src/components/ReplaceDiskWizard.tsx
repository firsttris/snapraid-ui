import type {
  DiskReplacement,
  ReplacementStep,
  ReplacementStepResult,
} from '@shared/types'
import {
  Check,
  CircleCheck,
  FolderOpen,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'
import {
  useClearDiskReplacement,
  useCurrentJob,
  useDiskReplacement,
  useRunDiskReplacementStep,
  useStartDiskReplacement,
} from '../hooks/queries'
import { cn } from '../lib/utils'
import * as m from '../paraglide/messages'
import { DirectoryBrowser } from './DirectoryBrowser'
import { ErrorAlert } from './ErrorAlert'
import { errorMessage, useFeedback } from './Feedback'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

const POLL_MS = 2000

type StepState = 'todo' | 'active' | 'done' | 'warning' | 'failed'

const STEP_MARKER: Record<StepState, string> = {
  todo: 'border bg-background text-muted-foreground',
  active: 'border border-blue-200 bg-blue-50 text-blue-700',
  done: 'bg-green-600 text-white',
  warning: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
  failed: 'bg-red-600 text-white',
}

const StepMarker = ({
  state,
  number,
}: {
  state: StepState
  number: number
}) => (
  <span
    className={cn(
      'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums',
      STEP_MARKER[state],
    )}
  >
    {state === 'active' ? (
      <Loader2 className="size-3.5 animate-spin" />
    ) : state === 'done' ? (
      <Check className="size-3.5" />
    ) : state === 'warning' ? (
      <TriangleAlert className="size-3.5" />
    ) : state === 'failed' ? (
      <X className="size-3.5" />
    ) : (
      number
    )}
  </span>
)

interface StepItemProps {
  state: StepState
  number: number
  last: boolean
  children: React.ReactNode
}

// One row of the numbered step list, a line joins it to the next one
const StepItem = ({ state, number, last, children }: StepItemProps) => (
  <li
    aria-current={state === 'active' ? 'step' : undefined}
    className="relative flex gap-3 text-sm"
  >
    {!last && (
      <span
        aria-hidden="true"
        className="absolute top-7 -bottom-3 left-3 w-px bg-border"
      />
    )}
    <StepMarker state={state} number={number} />
    {children}
  </li>
)

interface ReplaceDiskWizardProps {
  configPath: string
  diskName: string
  diskType: 'data' | 'parity'
  currentPath: string
  onClose: () => void
}

const stepState = (
  result: ReplacementStepResult | undefined,
  active: boolean,
): StepState => {
  if (active) return 'active'
  if (!result) return 'todo'
  if (result.result === 'error' || result.result === 'incomplete')
    return 'failed'
  if (result.result === 'aborted') return 'todo'
  return (result.unrecoverable ?? 0) > 0 || (result.errors ?? 0) > 0
    ? 'warning'
    : 'done'
}

const resultDetail = (result: ReplacementStepResult | undefined) => {
  if (!result) return null
  const parts = [
    result.recovered !== undefined &&
      m.replace_disk_recovered({ count: result.recovered }),
    (result.unrecoverable ?? 0) > 0 &&
      m.replace_disk_unrecoverable({ count: result.unrecoverable ?? 0 }),
    (result.errors ?? 0) > 0 &&
      m.replace_disk_errors({ count: result.errors ?? 0 }),
    result.logFile && `Log: ${result.logFile}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Replaces a failed disk the way "Recovering" in the SnapRAID manual describes.
 * Every step runs as a regular job, so the dialog can be closed and reopened at any time.
 */
export const ReplaceDiskWizard = ({
  configPath,
  diskName,
  diskType,
  currentPath,
  onClose,
}: ReplaceDiskWizardProps) => {
  const { confirm } = useFeedback()
  const [newPath, setNewPath] = useState(currentPath)
  const [showBrowser, setShowBrowser] = useState(false)
  const [error, setError] = useState('')

  const { data: replacement } = useDiskReplacement(configPath, {
    refetchInterval: POLL_MS,
  })
  const { data: job } = useCurrentJob({ refetchInterval: POLL_MS })
  const start = useStartDiskReplacement()
  const runStep = useRunDiskReplacementStep()
  const clear = useClearDiskReplacement()

  const own: DiskReplacement | null =
    replacement?.diskName === diskName ? replacement : null
  const otherInProgress =
    replacement && !own && !replacement.completedAt ? replacement : null
  const busy = start.isPending || runStep.isPending || clear.isPending

  const handleStart = async () => {
    setError('')
    const confirmed = await confirm({
      message: m.replace_disk_start_confirm({ diskName }),
      confirmLabel: m.replace_disk_start(),
      danger: true,
    })
    if (!confirmed) return
    start.mutate(
      { configPath, diskName, newPath: newPath.trim() },
      { onError: (err) => setError(errorMessage(err)) },
    )
  }

  const handleStep = async (step: ReplacementStep) => {
    setError('')
    if (step === 'sync' && (own?.steps.fix?.unrecoverable ?? 0) > 0) {
      const confirmed = await confirm({
        message: m.replace_disk_sync_confirm_unrecoverable(),
        confirmLabel: m.replace_disk_sync(),
        danger: true,
      })
      if (!confirmed) return
    }
    runStep.mutate(
      { configPath, step },
      { onError: (err) => setError(errorMessage(err)) },
    )
  }

  const handleCancel = async () => {
    const confirmed = await confirm({
      message: m.replace_disk_cancel_confirm(),
      confirmLabel: m.replace_disk_cancel(),
      danger: true,
    })
    if (confirmed) clear.mutate(configPath, { onSuccess: onClose })
  }

  const handleFinish = () => clear.mutate(configPath, { onSuccess: onClose })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-4 pr-12 text-left">
          <DialogTitle>{m.replace_disk_title({ diskName })}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {own && own.oldPath !== own.newPath
              ? `${own.oldPath} → ${own.newPath}`
              : (own?.newPath ?? currentPath)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-4">
          {otherInProgress ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                {m.replace_disk_other_in_progress({
                  diskName: otherInProgress.diskName,
                })}
              </AlertDescription>
            </Alert>
          ) : own ? (
            <ReplacementProgress
              replacement={own}
              runningCommand={job?.command}
              disabled={busy || !!job}
              onStep={handleStep}
            />
          ) : (
            <Intro
              diskName={diskName}
              diskType={diskType}
              newPath={newPath}
              onNewPathChange={setNewPath}
              onBrowse={() => setShowBrowser(true)}
            />
          )}

          {!own && !otherInProgress && job && (
            <Alert variant="warning">
              <Info />
              <AlertDescription>{m.remove_disk_job_running()}</AlertDescription>
            </Alert>
          )}

          {error && <ErrorAlert error={error} />}
        </div>

        <DialogFooter className="flex-wrap border-t px-6 py-4">
          {own && !own.completedAt && !job && (
            <Button
              variant="ghostDestructive"
              onClick={handleCancel}
              disabled={busy}
              className="sm:mr-auto"
            >
              {m.replace_disk_cancel()}
            </Button>
          )}
          {own?.completedAt ? (
            <Button onClick={handleFinish} disabled={busy}>
              {m.replace_disk_finish()}
            </Button>
          ) : (
            <Button onClick={onClose} variant="outline" disabled={busy}>
              {own ? m.common_close() : m.common_cancel()}
            </Button>
          )}
          {!own && !otherInProgress && (
            <Button
              onClick={handleStart}
              variant="destructive"
              disabled={busy || !!job || !newPath.trim()}
            >
              {start.isPending && <Loader2 className="animate-spin" />}
              {m.replace_disk_start()}
            </Button>
          )}
        </DialogFooter>

        {showBrowser && (
          <DirectoryBrowser
            title={m.data_disk_select_directory()}
            currentValue={newPath}
            onSelect={(path) => {
              setNewPath(path)
              setShowBrowser(false)
            }}
            onClose={() => setShowBrowser(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface IntroProps {
  diskName: string
  diskType: 'data' | 'parity'
  newPath: string
  onNewPathChange: (path: string) => void
  onBrowse: () => void
}

const Intro = ({
  diskName,
  diskType,
  newPath,
  onNewPathChange,
  onBrowse,
}: IntroProps) => {
  const steps = [
    { label: m.replace_disk_step_config() },
    {
      label: m.replace_disk_step_fix(),
      command: `snapraid fix -d ${diskName}`,
    },
    ...(diskType === 'data'
      ? [
          {
            label: m.replace_disk_step_check(),
            command: `snapraid check -a -d ${diskName}`,
          },
        ]
      : []),
    { label: m.replace_disk_step_sync(), command: 'snapraid sync' },
  ]

  return (
    <>
      <Alert variant="info">
        <Info />
        <AlertDescription>{m.replace_disk_intro()}</AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          {m.replace_disk_steps_title()}
        </h3>
        <ol className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <StepItem
              key={step.label}
              state="todo"
              number={index + 1}
              last={index === steps.length - 1}
            >
              <div className="min-w-0 pt-0.5">
                <div>{step.label}</div>
                {step.command && (
                  <code className="font-mono text-xs text-muted-foreground">
                    {step.command}
                  </code>
                )}
              </div>
            </StepItem>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="replace-disk-path">
          {diskType === 'data'
            ? m.replace_disk_new_path()
            : m.replace_disk_new_parity_path()}
        </Label>
        <div className="flex gap-2">
          <Input
            id="replace-disk-path"
            value={newPath}
            onChange={(e) => onNewPathChange(e.target.value)}
            className="font-mono"
          />
          {diskType === 'data' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onBrowse}
                  aria-label={m.config_manager_browse()}
                >
                  <FolderOpen />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{m.config_manager_browse()}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {m.replace_disk_same_path_hint()}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {m.replace_disk_schedules_paused()}
      </p>
    </>
  )
}

interface ReplacementProgressProps {
  replacement: DiskReplacement
  runningCommand: string | undefined
  disabled: boolean
  onStep: (step: ReplacementStep) => void
}

const ReplacementProgress = ({
  replacement,
  runningCommand,
  disabled,
  onStep,
}: ReplacementProgressProps) => {
  const { steps, diskName, diskType, completedAt } = replacement
  const fixDone = !!steps.fix && steps.fix.result !== 'aborted'
  const running = (step: ReplacementStep) => runningCommand === step

  const rows: Array<{
    step: ReplacementStep
    label: string
    command: string
    action?: { label: string; primary?: boolean }
  }> = [
    {
      step: 'fix',
      label: m.replace_disk_step_fix(),
      command: `snapraid fix -d ${diskName}`,
      action: completedAt
        ? undefined
        : { label: steps.fix ? m.replace_disk_retry() : m.replace_disk_run() },
    },
    ...(diskType === 'data'
      ? [
          {
            step: 'check' as const,
            label: `${m.replace_disk_step_check()} (${m.replace_disk_optional()})`,
            command: `snapraid check -a -d ${diskName}`,
            action:
              completedAt || !fixDone
                ? undefined
                : {
                    label: steps.check
                      ? m.replace_disk_retry()
                      : m.replace_disk_run(),
                  },
          },
        ]
      : []),
    {
      step: 'sync',
      label: m.replace_disk_step_sync(),
      command: 'snapraid sync',
      action:
        completedAt || !fixDone
          ? undefined
          : { label: m.replace_disk_sync(), primary: true },
    },
  ]

  const unrecoverable = steps.fix?.unrecoverable ?? 0
  const activeRow = rows.find((row) => running(row.step))

  return (
    <>
      <ol className="flex flex-col gap-4">
        <StepItem state="done" number={1} last={false}>
          <div className="min-w-0 pt-0.5">
            <div className="font-medium">{m.replace_disk_step_config()}</div>
            <div className="break-all font-mono text-xs text-muted-foreground">
              {diskType === 'data' ? 'data' : diskName}{' '}
              {diskType === 'data' ? `${diskName} ` : ''}
              {replacement.newPath}
            </div>
          </div>
        </StepItem>
        {rows.map((row, index) => {
          const result = steps[row.step]
          const detail = resultDetail(result)
          const state = stepState(result, running(row.step))
          return (
            <StepItem
              key={row.step}
              state={state}
              number={index + 2}
              last={index === rows.length - 1}
            >
              <div className="min-w-0 flex-1 pt-0.5">
                <div
                  className={
                    state === 'todo' ? 'text-muted-foreground' : 'font-medium'
                  }
                >
                  {row.label}
                </div>
                <div className="break-all font-mono text-xs text-muted-foreground">
                  {row.command}
                </div>
                {detail && (
                  <div className="mt-0.5 break-all text-xs text-muted-foreground">
                    {detail}
                  </div>
                )}
              </div>
              {row.action && !running(row.step) && (
                <Button
                  size="sm"
                  variant={row.action.primary ? 'default' : 'outline'}
                  onClick={() => onStep(row.step)}
                  disabled={disabled}
                  className="shrink-0 self-start"
                >
                  {row.action.label}
                </Button>
              )}
            </StepItem>
          )
        })}
      </ol>

      {activeRow && (
        <Alert variant="info">
          <Loader2 className="animate-spin" />
          <AlertDescription>
            {m.replace_disk_running({ command: activeRow.command })}
          </AlertDescription>
        </Alert>
      )}

      {!activeRow && steps.fix?.result === 'error' && unrecoverable === 0 && (
        <ErrorAlert error={m.replace_disk_fix_failed()} />
      )}

      {!completedAt && unrecoverable > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            {m.replace_disk_unrecoverable_hint({ count: unrecoverable })}
          </AlertDescription>
        </Alert>
      )}

      {!activeRow && fixDone && !completedAt && (
        <p className="text-sm text-muted-foreground">
          {m.replace_disk_before_sync()}
        </p>
      )}

      {completedAt && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {m.replace_disk_done({ diskName })}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
