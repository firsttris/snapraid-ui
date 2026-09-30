import { useEffect, useRef, useState } from 'react'
import {
  useCurrentJob,
  useRemoveDataDisk,
  useSnapRaidConfig,
} from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'

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

const STEP_ICONS: Record<StepState, string> = {
  todo: '○',
  active: '⏳',
  done: '✅',
  failed: '❌',
}

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

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">
            {m.remove_disk_title({ diskName })}
          </h2>
          <p className="mt-1 font-mono text-sm text-gray-500">{originalPath}</p>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {phase === 'intro' && (
            <>
              {pending && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  {m.remove_disk_resume()}
                </div>
              )}
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                ⚠️ {m.remove_disk_intro()}
              </div>
            </>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {m.remove_disk_steps_title()}
            </h3>
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={step.label} className="flex gap-3 text-sm">
                  <span className="w-5 shrink-0 text-center">
                    {STEP_ICONS[states[index]]}
                  </span>
                  <div className="min-w-0">
                    <div className="text-gray-800">
                      {index + 1}. {step.label}
                    </div>
                    <div className="font-mono text-xs text-gray-500 break-all">
                      {step.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {phase === 'intro' && (
            <p className="text-sm text-gray-600">
              {m.remove_disk_duration_hint()}
            </p>
          )}

          {phase === 'running' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              {m.remove_disk_running()}
            </div>
          )}

          {phase === 'done' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              {m.remove_disk_done({ diskName })}
            </div>
          )}

          {phase === 'failed' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {m.remove_disk_failed({ diskName })}
            </div>
          )}

          {otherJobRunning && (
            <p className="text-sm text-yellow-700">
              {m.remove_disk_job_running()}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <Button onClick={onClose} variant="secondary">
            {phase === 'intro' ? m.common_cancel() : m.common_close()}
          </Button>
          {(phase === 'intro' || phase === 'failed') && (
            <Button
              onClick={start}
              variant="danger"
              disabled={otherJobRunning || removeMutation.isPending}
            >
              {pending || phase === 'failed'
                ? m.remove_disk_retry()
                : m.remove_disk_start()}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
