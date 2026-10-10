import type { JobProgress } from '@shared/types'
import { Loader2, Square } from 'lucide-react'
import { getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import { Card } from './ui/card'

interface RunningJobBoxProps {
  command: string
  progress: JobProgress | null
  isAborting: boolean
  onAbort: () => void
}

const formatEta = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

const ProgressBar = ({ progress }: { progress: JobProgress }) => (
  <div className="space-y-2">
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={progress.percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="ui-stripes h-full rounded-full bg-blue-600 transition-[width] duration-500"
        style={{ width: `${Math.min(progress.percent, 100)}%` }}
      />
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums">
      <span className="font-semibold text-foreground">{progress.percent}%</span>
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

// Shown above the tiles while a job runs, the status is stale until it ends
export const RunningJobBox = ({
  command,
  progress,
  isAborting,
  onAbort,
}: RunningJobBoxProps) => (
  <Card className="ui-fade-in gap-4 p-5">
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        <Loader2 className="size-5 animate-spin" />
      </span>
      <div className="min-w-[12rem] flex-1">
        <p className="font-semibold">
          {m.nav_job_running({ command: getCommandLabel(command) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {isAborting ? m.commands_aborting() : m.health_job_hint()}
        </p>
      </div>
      <Button
        variant="destructiveOutline"
        onClick={onAbort}
        disabled={isAborting}
      >
        <Square className="size-3.5" fill="currentColor" />
        {m.commands_abort()}
      </Button>
    </div>
    {progress && !isAborting && <ProgressBar progress={progress} />}
  </Card>
)
