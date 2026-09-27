import { describe, expect, it } from 'vitest'
import { parseProgress, renderConsoleOutput } from '../progress'

describe('parseProgress', () => {
  it('returns null without a progress bar', () => {
    expect(parseProgress('Loading state...\nSyncing...\n')).toBeNull()
  })

  it('reads the latest progress bar', () => {
    const output =
      'Syncing...\n3%, 120 MB\r12%, 480 MB, 150 MB/s, 1200 stripe/s, CPU 12%, 1:05 ETA\r'
    expect(parseProgress(output)).toEqual({
      percent: 12,
      processedMB: 480,
      speedMBs: 150,
      etaMinutes: 65,
    })
  })

  it('handles the temperature field', () => {
    const output =
      '50%, 900 MB, 90 MB/s, 700 stripe/s, CPU 5%, Tmax 41 (45), 0:07 ETA\r'
    expect(parseProgress(output)).toMatchObject({ percent: 50, etaMinutes: 7 })
  })

  it('leaves speed and eta undefined before the first estimate', () => {
    expect(parseProgress('0%, 0 MB\r')).toEqual({
      percent: 0,
      processedMB: 0,
      speedMBs: undefined,
      etaMinutes: undefined,
    })
  })
})

describe('renderConsoleOutput', () => {
  it('keeps only the last version of a rewritten line', () => {
    expect(
      renderConsoleOutput('Syncing...\n1%, 5 MB\r2%, 9 MB\r\nDone\n'),
    ).toBe('Syncing...\n2%, 9 MB\nDone\n')
  })

  it('leaves plain output untouched', () => {
    expect(renderConsoleOutput('a\nb\n')).toBe('a\nb\n')
  })
})
