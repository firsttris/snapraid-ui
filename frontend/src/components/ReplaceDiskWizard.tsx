import type {
  DiskReplacement,
  ReplacementStep,
  ReplacementStepResult,
} from '@shared/types'
import { useState } from 'react'
import {
  useClearDiskReplacement,
  useCurrentJob,
  useDiskReplacement,
  useRunDiskReplacementStep,
  useStartDiskReplacement,
} from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { DirectoryBrowser } from './DirectoryBrowser'
import { errorMessage, useFeedback } from './Feedback'

const POLL_MS = 2000

type StepState = 'todo' | 'active' | 'done' | 'warning' | 'failed'

const STEP_ICONS: Record<StepState, string> = {
  todo: '○',
  active: '⏳',
  done: '✅',
  warning: '⚠️',
  failed: '❌',
}

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
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">
            {m.replace_disk_title({ diskName })}
          </h2>
          <p className="mt-1 font-mono text-sm text-gray-500 break-all">
            {own && own.oldPath !== own.newPath
              ? `${own.oldPath} → ${own.newPath}`
              : (own?.newPath ?? currentPath)}
          </p>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {otherInProgress ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              {m.replace_disk_other_in_progress({
                diskName: otherInProgress.diskName,
              })}
            </div>
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

        <div className="flex flex-wrap justify-end gap-3 p-6 border-t">
          {own && !own.completedAt && !job && (
            <Button
              variant="ghostDanger"
              onClick={handleCancel}
              disabled={busy}
              className="mr-auto"
            >
              {m.replace_disk_cancel()}
            </Button>
          )}
          {own?.completedAt ? (
            <Button onClick={handleFinish} disabled={busy}>
              {m.replace_disk_finish()}
            </Button>
          ) : (
            <Button onClick={onClose} variant="secondary">
              {own ? m.common_close() : m.common_cancel()}
            </Button>
          )}
          {!own && !otherInProgress && (
            <Button
              onClick={handleStart}
              variant="danger"
              disabled={busy || !!job || !newPath.trim()}
            >
              {m.replace_disk_start()}
            </Button>
          )}
        </div>
      </div>

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
    </div>
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
}: IntroProps) => (
  <>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      {m.replace_disk_intro()}
    </div>

    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        {m.replace_disk_steps_title()}
      </h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
        <li>{m.replace_disk_step_config()}</li>
        <li>
          {m.replace_disk_step_fix()}{' '}
          <code className="text-xs text-gray-500">
            snapraid fix -d {diskName}
          </code>
        </li>
        {diskType === 'data' && (
          <li>
            {m.replace_disk_step_check()}{' '}
            <code className="text-xs text-gray-500">
              snapraid check -a -d {diskName}
            </code>
          </li>
        )}
        <li>
          {m.replace_disk_step_sync()}{' '}
          <code className="text-xs text-gray-500">snapraid sync</code>
        </li>
      </ol>
    </div>

    <div>
      <label
        htmlFor="replace-disk-path"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {diskType === 'data'
          ? m.replace_disk_new_path()
          : m.replace_disk_new_parity_path()}
      </label>
      <div className="flex gap-2">
        <input
          id="replace-disk-path"
          type="text"
          value={newPath}
          onChange={(e) => onNewPathChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        {diskType === 'data' && (
          <Button variant="secondary" onClick={onBrowse}>
            📁 {m.config_manager_browse()}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {m.replace_disk_same_path_hint()}
      </p>
    </div>

    <p className="text-sm text-gray-600">{m.replace_disk_schedules_paused()}</p>
  </>
)

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
      <ol className="space-y-3">
        <li className="flex gap-3 text-sm">
          <span className="w-5 shrink-0 text-center">✅</span>
          <div className="min-w-0">
            <div className="text-gray-800">
              1. {m.replace_disk_step_config()}
            </div>
            <div className="font-mono text-xs text-gray-500 break-all">
              {diskType === 'data' ? 'data' : diskName}{' '}
              {diskType === 'data' ? `${diskName} ` : ''}
              {replacement.newPath}
            </div>
          </div>
        </li>
        {rows.map((row, index) => {
          const result = steps[row.step]
          const detail = resultDetail(result)
          return (
            <li key={row.step} className="flex gap-3 text-sm">
              <span className="w-5 shrink-0 text-center">
                {STEP_ICONS[stepState(result, running(row.step))]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-gray-800">
                  {index + 2}. {row.label}
                </div>
                <div className="font-mono text-xs text-gray-500">
                  {row.command}
                </div>
                {detail && (
                  <div className="mt-0.5 text-xs text-gray-600">{detail}</div>
                )}
              </div>
              {row.action && !running(row.step) && (
                <Button
                  size="sm"
                  variant={row.action.primary ? 'primary' : 'secondary'}
                  onClick={() => onStep(row.step)}
                  disabled={disabled}
                  className="shrink-0 self-start"
                >
                  {row.action.label}
                </Button>
              )}
            </li>
          )
        })}
      </ol>

      {activeRow && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {m.replace_disk_running({ command: activeRow.command })}
        </div>
      )}

      {!activeRow && steps.fix?.result === 'error' && unrecoverable === 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {m.replace_disk_fix_failed()}
        </div>
      )}

      {!completedAt && unrecoverable > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {m.replace_disk_unrecoverable_hint({ count: unrecoverable })}
        </div>
      )}

      {!activeRow && fixDone && !completedAt && (
        <p className="text-sm text-gray-600">{m.replace_disk_before_sync()}</p>
      )}

      {completedAt && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {m.replace_disk_done({ diskName })}
        </div>
      )}
    </>
  )
}
