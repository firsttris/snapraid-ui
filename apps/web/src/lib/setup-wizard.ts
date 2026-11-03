import { type ArraySetup, nextDiskName } from '@shared/array-setup'
import type { MountCandidate } from '@shared/types'

export type DiskRole = 'none' | 'data' | 'parity'

// A mount point or a folder added by hand, and what it becomes in the new array
export interface WizardDisk {
  path: string
  mount?: MountCandidate // Size and contents, unknown for folders added by hand
  role: DiskRole
  name: string // Data disk name, d1, d2, …
}

export const fromMounts = (mounts: MountCandidate[]): WizardDisk[] =>
  mounts.map((mount) => ({
    path: mount.path,
    mount,
    // A disk that already holds a parity file was one before
    role: mount.snapraidFiles.some((file) => file.includes('parity'))
      ? 'parity'
      : 'none',
    name: '',
  }))

/**
 * Gives a disk its role; a new data disk gets the next free name
 */
export const withRole = (
  disks: WizardDisk[],
  path: string,
  role: DiskRole,
): WizardDisk[] =>
  disks.map((disk) => {
    if (disk.path !== path) return disk
    const taken = disks
      .filter((other) => other.role === 'data' && other.path !== path)
      .map((other) => other.name)
    return {
      ...disk,
      role,
      name: role === 'data' ? disk.name || nextDiskName(taken) : disk.name,
    }
  })

export const toSetup = (disks: WizardDisk[]): ArraySetup => ({
  dataDisks: disks
    .filter((disk) => disk.role === 'data')
    .map((disk) => ({ name: disk.name, path: disk.path })),
  parityPaths: disks
    .filter((disk) => disk.role === 'parity')
    .map((disk) => disk.path),
})

export type CapacityWarning =
  | { kind: 'parity_too_small'; parity: string; disk: string } // Smaller than what the data disk holds today
  | { kind: 'parity_smaller'; parity: string; disk: string } // Smaller than the data disk, fine until it fills up
  | { kind: 'not_empty'; path: string } // Parity disk with other files on it

/**
 * SnapRAID needs each parity disk at least as large as the largest data disk; only known
 * for detected mounts
 */
export const capacityWarnings = (disks: WizardDisk[]): CapacityWarning[] => {
  const data = disks.filter((disk) => disk.role === 'data' && disk.mount)
  const parity = disks.filter((disk) => disk.role === 'parity' && disk.mount)
  const largestUsed = data.reduce<WizardDisk | undefined>(
    (max, disk) =>
      !max || (disk.mount?.usedBytes ?? 0) > (max.mount?.usedBytes ?? 0)
        ? disk
        : max,
    undefined,
  )
  const largestSize = data.reduce<WizardDisk | undefined>(
    (max, disk) =>
      !max || (disk.mount?.totalBytes ?? 0) > (max.mount?.totalBytes ?? 0)
        ? disk
        : max,
    undefined,
  )
  const warnings: CapacityWarning[] = []
  for (const disk of parity) {
    const size = disk.mount?.totalBytes ?? 0
    if (largestUsed?.mount && size < largestUsed.mount.usedBytes) {
      warnings.push({
        kind: 'parity_too_small',
        parity: disk.path,
        disk: largestUsed.path,
      })
    } else if (largestSize?.mount && size < largestSize.mount.totalBytes) {
      warnings.push({
        kind: 'parity_smaller',
        parity: disk.path,
        disk: largestSize.path,
      })
    }
    const others =
      (disk.mount?.empty ?? true)
        ? false
        : (disk.mount?.snapraidFiles.length ?? 0) === 0
    if (others) warnings.push({ kind: 'not_empty', path: disk.path })
  }
  return warnings
}

/**
 * File name for a config name: "Media Server" -> "media-server"
 */
export const fileNameFor = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'snapraid'
