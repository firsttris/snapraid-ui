import type { MountCandidate } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  capacityWarnings,
  fileNameFor,
  fromMounts,
  toSetup,
  withRole,
} from '../setup-wizard'

const TB = 1e12
const mount = (
  path: string,
  totalTB: number,
  usedTB: number,
  changes: Partial<MountCandidate> = {},
): MountCandidate => ({
  path,
  device: '/dev/sdx',
  fstype: 'ext4',
  totalBytes: totalTB * TB,
  usedBytes: usedTB * TB,
  freeBytes: (totalTB - usedTB) * TB,
  empty: usedTB === 0,
  snapraidFiles: [],
  ...changes,
})

describe('setup wizard', () => {
  it('names data disks in order and builds the setup', () => {
    let disks = fromMounts([
      mount('/mnt/disk1', 4, 3),
      mount('/mnt/disk2', 4, 1),
      mount('/mnt/parity', 6, 0),
    ])
    disks = withRole(disks, '/mnt/disk2', 'data')
    disks = withRole(disks, '/mnt/disk1', 'data')
    disks = withRole(disks, '/mnt/parity', 'parity')
    expect(toSetup(disks)).toEqual({
      dataDisks: [
        { name: 'd2', path: '/mnt/disk1' },
        { name: 'd1', path: '/mnt/disk2' },
      ],
      parityPaths: ['/mnt/parity'],
    })
    expect(capacityWarnings(disks)).toEqual([])
  })

  it('takes a disk with a parity file for parity', () => {
    const [disk] = fromMounts([
      mount('/mnt/p', 6, 2, { snapraidFiles: ['snapraid.parity'] }),
    ])
    expect(disk.role).toBe('parity')
  })

  it('warns about a parity disk that is too small or not empty', () => {
    let disks = fromMounts([
      mount('/mnt/disk1', 8, 5),
      mount('/mnt/small', 4, 1),
    ])
    disks = withRole(disks, '/mnt/disk1', 'data')
    disks = withRole(disks, '/mnt/small', 'parity')
    expect(capacityWarnings(disks)).toEqual([
      { kind: 'parity_too_small', parity: '/mnt/small', disk: '/mnt/disk1' },
      { kind: 'not_empty', path: '/mnt/small' },
    ])
  })

  it('makes a file name from the config name', () => {
    expect(fileNameFor('Media Server')).toBe('media-server')
    expect(fileNameFor('Fotos & Ärchive')).toBe('fotos-archive')
    expect(fileNameFor('  ')).toBe('snapraid')
  })
})
