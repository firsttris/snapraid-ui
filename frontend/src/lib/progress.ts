export interface JobProgress {
  percent: number
  processedMB: number
  speedMBs?: number
  etaMinutes?: number
}

// SnapRAID's progress bar, e.g. "45%, 1234 MB, 150 MB/s, 1200 stripe/s, CPU 12%, 0:05 ETA".
// Speed and ETA are missing until SnapRAID has enough samples.
const PROGRESS_PATTERN =
  /(\d+)%, (\d+) MB(?:, (\d+) MB\/s)?(?:, \d+ stripe\/s)?(?:, CPU \d+%)?(?:, Tmax \d+(?: \(\d+\))?)?(?:, (\d+):(\d{2}) ETA)?/g

// Only the tail is searched, the progress bar is rewritten in place over and over
const TAIL_LENGTH = 2000

/**
 * Latest progress of a running SnapRAID command, from its console output
 */
export const parseProgress = (output: string): JobProgress | null => {
  const matches = [...output.slice(-TAIL_LENGTH).matchAll(PROGRESS_PATTERN)]
  const last = matches.at(-1)
  if (!last) return null

  const [, percent, processed, speed, etaHours, etaMinutes] = last
  return {
    percent: Number(percent),
    processedMB: Number(processed),
    speedMBs: speed !== undefined ? Number(speed) : undefined,
    etaMinutes:
      etaHours !== undefined
        ? Number(etaHours) * 60 + Number(etaMinutes)
        : undefined,
  }
}

/**
 * Apply carriage returns like a terminal: text after "\r" replaces the current line
 */
export const renderConsoleOutput = (output: string): string =>
  output
    .split('\n')
    .map((line) => {
      // A trailing "\r" means the line is about to be overwritten, keep what is shown now
      const segments = line.split('\r').filter((segment) => segment !== '')
      return segments.at(-1) ?? ''
    })
    .join('\n')
