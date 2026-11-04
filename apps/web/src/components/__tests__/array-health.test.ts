import type { DiskIssue, SnapRaidStatus } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { getArrayHealth } from '../ArrayHealthPanel'

const status = (diskIssues: DiskIssue[] = [], hasErrors = false) =>
  ({
    hasErrors,
    parityUpToDate: true,
    newFiles: 0,
    modifiedFiles: 0,
    deletedFiles: 0,
    diskIssues,
    rawOutput: '',
  }) as SnapRaidStatus

const health = (input: Partial<Parameters<typeof getArrayHealth>[0]>) =>
  getArrayHealth({
    status: status(),
    isStatusError: false,
    isBusy: false,
    lastSync: null,
    lastScrub: null,
    ...input,
  }).health

const empty: DiskIssue = {
  disk: 'd1',
  type: 'data',
  kind: 'empty',
  path: '/mnt/d1',
  files: 3,
}
const changed: DiskIssue = {
  disk: 'd2',
  type: 'data',
  kind: 'uuid_changed',
  path: '/mnt/d2',
}

describe('getArrayHealth', () => {
  it('a missing or empty disk comes first, even before bad blocks', () => {
    expect(health({ status: status([empty], true) })).toBe('degraded')
  })

  it('a failing disk outranks bad blocks', () => {
    expect(health({ status: status([], true), smartCritical: ['d3'] })).toBe(
      'failing',
    )
  })

  it('a changed filesystem alone is only worth a look', () => {
    expect(health({ status: status([changed]) })).toBe('disk_changed')
    expect(health({ status: status([changed], true) })).toBe('errors')
  })

  it('healthy without issues', () => {
    expect(health({})).toBe('healthy')
  })
})
