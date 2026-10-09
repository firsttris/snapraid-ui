import type { DiffReport, RestoreFile } from '@shared/types'

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
