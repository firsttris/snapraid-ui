import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIMPLE_SCHEDULE,
  describeRoutine,
  nextRuns,
  parseSimpleCron,
  toCron,
} from '../schedules/scheduleText'

describe('parseSimpleCron', () => {
  it('reads the four shapes the form offers and writes them back the same', () => {
    for (const cron of [
      '0 2 * * *',
      '30 4 * * 0',
      '15 3 1 * *',
      '0 */6 * * *',
      '5 * * * *',
    ]) {
      const simple = parseSimpleCron(cron)
      expect(simple, cron).toBeDefined()
      expect(toCron(simple ?? DEFAULT_SIMPLE_SCHEDULE)).toBe(cron)
    }
  })

  it('reads Sunday as 7 as Sunday', () => {
    expect(parseSimpleCron('0 2 * * 7')).toMatchObject({
      frequency: 'weekly',
      dayOfWeek: 0,
    })
  })

  it('leaves everything else to the cron field', () => {
    for (const cron of [
      '*/30 * * * *',
      '0 2 * * 1-5',
      '0 2 1 1 *',
      '0 2,14 * * *',
      '0 2 1 * 0',
      '0 0 2 * * *',
      'nonsense',
    ]) {
      expect(parseSimpleCron(cron), cron).toBeUndefined()
    }
  })
})

describe('nextRuns', () => {
  it('lists the next runs and rejects invalid expressions', () => {
    const from = new Date(2026, 0, 1, 12, 0)
    expect(nextRuns('0 2 * * *', 2, from)).toEqual([
      new Date(2026, 0, 2, 2, 0),
      new Date(2026, 0, 3, 2, 0),
    ])
    expect(nextRuns('99 2 * * *', 2, from)).toBeUndefined()
  })
})

describe('describeRoutine', () => {
  it('lists the steps of a sync routine, nothing for a plain sync', () => {
    expect(describeRoutine({ command: 'sync', args: [] })).toBeUndefined()
    expect(
      describeRoutine({
        command: 'sync',
        args: [],
        touchBefore: true,
        scrubAfter: ['-p', 'new'],
      }),
    ).toMatch(/^Touch → Sync → Scrub \(.+\)$/)
  })
})
