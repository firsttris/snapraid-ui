import type { DiffFileInfo, DiffReport, RestoreFile } from '@shared/types'

// The backend restores at most this many files at once (MAX_RESTORE_FILES)
export const MAX_RESTORE = 1000

export type RecoveryKind = 'deleted' | 'changed'

export interface RecoverableFile extends RestoreFile {
  key: string
}

const keyOf = (file: RestoreFile) => `${file.disk}\u0000${file.path}`

/**
 * Files parity still has in their state of the last sync: deleted ones and changed ones.
 * Files without a disk can't be restored by path and are left out.
 */
export const recoverableFiles = (
  diff: DiffReport | undefined,
): Record<RecoveryKind, RecoverableFile[]> => {
  const of = (status: 'removed' | 'updated') =>
    (diff?.files ?? [])
      .filter((file) => file.status === status && file.disk)
      .map((file) => {
        const restore = { disk: file.disk as string, path: file.name }
        return { ...restore, key: keyOf(restore) }
      })
      .sort(
        (a, b) => a.disk.localeCompare(b.disk) || a.path.localeCompare(b.path),
      )
  return { deleted: of('removed'), changed: of('updated') }
}

export const matchesSearch = (file: RestoreFile, search: string) => {
  const needle = search.trim().toLowerCase()
  return (
    !needle ||
    file.path.toLowerCase().includes(needle) ||
    file.disk.toLowerCase() === needle
  )
}

// Other changes the diff reports: what the next sync will add, and files that only moved
export interface ChangeEntry {
  disk?: string
  path: string
  size?: number
  status: DiffFileInfo['status']
}

const byPath = (a: ChangeEntry, b: ChangeEntry) =>
  (a.disk ?? '').localeCompare(b.disk ?? '') || a.path.localeCompare(b.path)

/**
 * New files, not yet protected, and files moved, copied or restored, which lose nothing
 */
export const otherChanges = (
  diff: DiffReport | undefined,
): { added: ChangeEntry[]; other: ChangeEntry[] } => {
  const of = (statuses: DiffFileInfo['status'][]) =>
    (diff?.files ?? [])
      .filter((file) => statuses.includes(file.status))
      .map((file) => ({
        disk: file.disk,
        path: file.name,
        size: file.size,
        status: file.status,
      }))
      .sort(byPath)
  return { added: of(['added']), other: of(['moved', 'copied', 'restored']) }
}

export interface FolderTotal {
  folder: string
  files: number
  bytes: number
  sized: boolean // All files of it have a size
}

/**
 * Files and bytes per top folder, the largest first. When all files share one top folder,
 * its subfolders tell more.
 */
export const folderTotals = (files: ChangeEntry[]): FolderTotal[] => {
  const group = (depth: number) => {
    const totals = new Map<string, FolderTotal>()
    for (const file of files) {
      const parts = file.path.replace(/^\/+/, '').split('/')
      const folder =
        parts.length > 1
          ? parts.slice(0, Math.min(depth, parts.length - 1)).join('/')
          : ''
      const total = totals.get(folder) ?? {
        folder,
        files: 0,
        bytes: 0,
        sized: true,
      }
      total.files++
      total.bytes += file.size ?? 0
      if (file.size === undefined) total.sized = false
      totals.set(folder, total)
    }
    return [...totals.values()].sort(
      (a, b) =>
        b.bytes - a.bytes ||
        b.files - a.files ||
        a.folder.localeCompare(b.folder),
    )
  }
  const top = group(1)
  return top.length === 1 && top[0].folder !== '' ? group(2) : top
}

export const matchesChange = (file: ChangeEntry, search: string) => {
  const needle = search.trim().toLowerCase()
  return (
    !needle ||
    file.path.toLowerCase().includes(needle) ||
    (file.disk ?? '').toLowerCase() === needle
  )
}
