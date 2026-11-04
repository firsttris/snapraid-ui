import type { RunningJob } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { createJobTracker } from '../job-tracker'

const job = (processId: string): RunningJob => ({
  command: 'sync',
  configPath: '/etc/snapraid.conf',
  startTime: '2026-10-01T10:00:00.000Z',
  processId,
})

describe('createJobTracker', () => {
  it('reports a seen job that polling no longer finds', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    expect(tracker.takeMissing(job('sync-1'))).toBeNull()
    expect(tracker.takeMissing(null)).toBe('sync-1')
    // Claimed, the next poll does not report it again
    expect(tracker.takeMissing(null)).toBeNull()
  })

  it('ignores polls before the job is known or while still loading', () => {
    const tracker = createJobTracker()
    // Right after start(), the backend may not report the job yet
    expect(tracker.takeMissing(null)).toBeNull()
    tracker.observe('sync-1')
    expect(tracker.takeMissing(undefined)).toBeNull()
  })

  it('handles the end only once when WebSocket and polling both report it', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    expect(tracker.finish('sync-1')).toBe(true)
    expect(tracker.takeMissing(null)).toBeNull()
    expect(tracker.finish('sync-1')).toBe(false)
  })

  it('ignores the WebSocket event when polling handled the end first', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    const missing = tracker.takeMissing(null)
    expect(missing).toBe('sync-1')
    expect(tracker.finish(missing ?? undefined)).toBe(true)
    expect(tracker.finish('sync-1')).toBe(false)
  })

  it('does not pick up a finished job again from a stale poll', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    tracker.finish('sync-1')
    expect(tracker.observe('sync-1')).toBe(false)
    expect(tracker.takeMissing(null)).toBeNull()
  })

  it('tracks the next job after one has finished', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    tracker.finish('sync-1')
    expect(tracker.observe('scrub-2')).toBe(true)
    expect(tracker.takeMissing(null)).toBe('scrub-2')
  })

  it('finishes the seen job when the end comes without an id', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    expect(tracker.finish()).toBe(true)
    expect(tracker.finish('sync-1')).toBe(false)
  })

  it('lets a failed start through without touching earlier jobs', () => {
    const tracker = createJobTracker()
    tracker.observe('sync-1')
    tracker.finish('sync-1')
    // The job could not be started, nothing was ever seen
    expect(tracker.finish()).toBe(true)
    expect(tracker.finish('sync-1')).toBe(false)
  })
})
