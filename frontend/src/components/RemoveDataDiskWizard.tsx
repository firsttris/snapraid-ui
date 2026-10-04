import {
  Check,
  CircleCheck,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  useCurrentJob,
  useRemoveDataDisk,
  useSnapRaidConfig,
} from '../hooks/queries'
import { cn } from '../lib/utils'
import * as m from '../paraglide/messages'
import { ErrorAlert } from './ErrorAlert'
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

// Must match REMOVAL_DIR in backend/src/config-parser.ts
const REMOVAL_DIR = '.snapraid-removal'

const JOB_POLL_MS = 2000
// A sync that fails right away may be gone before the first poll sees it
const JOB_START_GRACE_MS = 5000

type Phase = 'intro' | 'running' | 'done' | 'failed'
type StepState = 'todo' | 'active' | 'done' | 'failed'

interface RemoveDataDiskWizardProps {
  configPath: string
  diskName: string
  diskPath: string
  pending: boolean
  onClose: () => void
}

const STEP_MARKER: Record<StepState, string> = {
  todo: 'border bg-background text-muted-foreground',
  active: 'border border-blue-200 bg-blue-50 text-blue-700',
  done: 'bg-green-600 text-white',
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
    ) : state === 'failed' ? (
      <X className="size-3.5" />
    ) : (
      number
    )}
  </span>
)

// Steps 1-2 are config edits done before the sync, step 4 happens after a successful sync
const stepStates = (phase: Phase, pending: boolean): StepState[] => {
  const prepared = pending || phase !== 'intro' ? 'done' : 'todo'
  const sync: Record<Phase, StepState> = {
    intro: 'todo',
    running: 'active',
    done: 'done',
    failed: 'failed',
  }
  return [prepared, prepared, sync[phase], phase === 'done' ? 'done' : 'todo']
}

/**
 * Removes a data disk the way the SnapRAID FAQ describes. The backend runs the
 * whole sequence, so closing the dialog does not interrupt it.
 */
export const RemoveDataDiskWizard = ({
  configPath,
  diskName,
  diskPath,
  pending,
  onClose,
}: RemoveDataDiskWizardProps) => {
  const [phase, setPhase] = useState<Phase>('intro')
  const [error, setError] = useState('')
  const startedAt = useRef(0)
  const sawJob = useRef(false)
  const evaluating = useRef(false)

  const removeMutation = useRemoveDataDisk()
  const { refetch: refetchConfig } = useSnapRaidConfig(configPath)
  const { data: job, dataUpdatedAt } = useCurrentJob({
    refetchInterval: phase === 'running' ? JOB_POLL_MS : false,
  })

  const originalPath = pending
    ? diskPath.replace(new RegExp(`/${REMOVAL_DIR}/?$`), '')
    : diskPath
  const emptyDir = `${originalPath.replace(/\/+$/, '')}/${REMOVAL_DIR}`

  // Once the job is gone the config tells the outcome: the backend drops the disk only after a successful sync
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-evaluate on every poll, even when the job stays null
  useEffect(() => {
    if (phase !== 'running' || evaluating.current) return
    if (job) {
      sawJob.current = true
      return
    }
    if (!sawJob.current && Date.now() - startedAt.current < JOB_START_GRACE_MS)
      return

    evaluating.current = true
    refetchConfig().then(({ data }) => {
      evaluating.current = false
      setPhase(data && !(diskName in data.data) ? 'done' : 'failed')
    })
  }, [phase, job, dataUpdatedAt])

  const start = () => {
    setError('')
    removeMutation.mutate(
      { configPath, diskName },
      {
        onSuccess: () => {
          startedAt.current = Date.now()
          sawJob.current = false
          setPhase('running')
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  const otherJobRunning = phase !== 'running' && !!job
  const steps = [
    {
      label: m.remove_disk_step_point(),
      detail: `data ${diskName} ${emptyDir}`,
    },
    {
      label: m.remove_disk_step_content(),
      detail: `content ${originalPath.replace(/\/+$/, '')}/…`,
    },
    { label: m.remove_disk_step_sync(), detail: 'snapraid sync -E' },
    { label: m.remove_disk_step_finalize(), detail: `data ${diskName} …` },
  ]
  const states = stepStates(phase, pending)

  const busy = removeMutation.isPending

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
          <DialogTitle>{m.remove_disk_title({ diskName })}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {originalPath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-4">
          {phase === 'intro' && (
            <>
              {pending && (
                <Alert variant="warning">
                  <Info />
                  <AlertDescription>{m.remove_disk_resume()}</AlertDescription>
                </Alert>
              )}
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertDescription>{m.remove_disk_intro()}</AlertDescription>
              </Alert>
            </>
          )}

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">
              {m.remove_disk_steps_title()}
            </h3>
            <ol className="flex flex-col gap-4">
              {steps.map((step, index) => (
                <li
                  key={step.label}
                  aria-current={states[index] === 'active' ? 'step' : undefined}
                  className="relative flex gap-3 text-sm"
                >
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-7 -bottom-3 left-3 w-px bg-border"
                    />
                  )}
                  <StepMarker state={states[index]} number={index + 1} />
                  <div className="min-w-0 pt-0.5">
                    <div
                      className={cn(
                        states[index] === 'todo'
                          ? 'text-muted-foreground'
                          : 'font-medium',
                      )}
                    >
                      {step.label}
                    </div>
                    <div className="break-all font-mono text-xs text-muted-foreground">
                      {step.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {phase === 'intro' && (
            <p className="text-sm text-muted-foreground">
              {m.remove_disk_duration_hint()}
            </p>
          )}

          {phase === 'running' && (
            <Alert variant="info">
              <Loader2 className="animate-spin" />
              <AlertDescription>{m.remove_disk_running()}</AlertDescription>
            </Alert>
          )}

          {phase === 'done' && (
            <Alert variant="success">
              <CircleCheck />
              <AlertDescription>
                {m.remove_disk_done({ diskName })}
              </AlertDescription>
            </Alert>
          )}

          {phase === 'failed' && (
            <ErrorAlert error={m.remove_disk_failed({ diskName })} />
          )}

          {otherJobRunning && (
            <Alert variant="warning">
              <Info />
              <AlertDescription>{m.remove_disk_job_running()}</AlertDescription>
            </Alert>
          )}

          {error && <ErrorAlert error={error} />}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={onClose} variant="outline" disabled={busy}>
            {phase === 'intro' ? m.common_cancel() : m.common_close()}
          </Button>
          {(phase === 'intro' || phase === 'failed') && (
            <Button
              onClick={start}
              variant="destructive"
              disabled={otherJobRunning || busy}
            >
              {busy && <Loader2 className="animate-spin" />}
              {pending || phase === 'failed'
                ? m.remove_disk_retry()
                : m.remove_disk_start()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
