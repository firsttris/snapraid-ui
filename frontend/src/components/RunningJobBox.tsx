import { Square } from 'lucide-react'
import { getCommandLabel } from '../lib/commands'
import type { JobProgress } from '../lib/progress'
import * as m from '../paraglide/messages'

interface RunningJobBoxProps {
  command: string
  progress: JobProgress | null
  isAborting: boolean
  onAbort: () => void
}

const formatEta = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

const ProgressBar = ({ progress }: { progress: JobProgress }) => (
  <div className="mt-3">
    <div className="h-2 overflow-hidden rounded-full bg-blue-100">
      <div
        className="ui-stripes h-full rounded-full bg-blue-600 transition-[width] duration-500"
        style={{ width: `${Math.min(progress.percent, 100)}%` }}
      />
    </div>
    <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums">
      <span className="font-semibold">{progress.percent}%</span>
      <span>{m.progress_processed({ size: progress.processedMB })}</span>
      {progress.speedMBs !== undefined && (
        <span>{m.progress_speed({ speed: progress.speedMBs })}</span>
      )}
      {progress.etaMinutes !== undefined && (
        <span>{m.progress_eta({ eta: formatEta(progress.etaMinutes) })}</span>
      )}
    </div>
  </div>
)

// Takes the place of the health message while a job runs, the status is stale until it ends
export const RunningJobBox = ({
  command,
  progress,
  isAborting,
  onAbort,
}: RunningJobBoxProps) => (
  <div className="ui-fade-in rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
        <div>
          <p className="font-semibold">
            {m.nav_job_running({ command: getCommandLabel(command) })}
          </p>
          <p className="text-sm">
            {isAborting ? m.commands_aborting() : m.health_job_hint()}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAbort}
        disabled={isAborting}
        className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        <Square size={14} fill="currentColor" />
        {m.commands_abort()}
      </button>
    </div>
    {progress && !isAborting && <ProgressBar progress={progress} />}
  </div>
)
