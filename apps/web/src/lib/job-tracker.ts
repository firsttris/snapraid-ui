import type { RunningJob } from '@shared/types'

/**
 * Keeps track of which job the client knows to be running, so its end is handled exactly once,
 * whether the WebSocket reports it or polling notices the job is gone (missed event after a reload)
 */
export const createJobTracker = () => {
  let seen: string | null = null
  let finished: string | null = null

  return {
    // A job the backend reports as running; false for one that has already finished
    observe: (processId: string): boolean => {
      if (processId === finished) return false
      seen = processId
      return true
    },

    // Claims the end of a job; false when it was already handled
    finish: (processId?: string): boolean => {
      const id = processId ?? seen
      if (id && id === finished) return false
      if (id) finished = id
      seen = null
      return true
    },

    // The tracked job when polling no longer reports it; claimed, so it is returned only once
    takeMissing: (currentJob: RunningJob | null | undefined): string | null => {
      if (currentJob !== null || !seen) return null
      const id = seen
      seen = null
      return id
    },
  }
}

export type JobTracker = ReturnType<typeof createJobTracker>
