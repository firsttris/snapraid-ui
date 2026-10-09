import type { DiffReport } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { matchesSearch, recoverableFiles } from '../recovery'

const diff = (files: DiffReport['files']): DiffReport => ({
  files,
  totalFiles: files.length,
  equalFiles: 0,
  newFiles: 0,
  modifiedFiles: 0,
  deletedFiles: 0,
  movedFiles: 0,
  copiedFiles: 0,
  restoredFiles: 0,
  timestamp: '',
  rawOutput: '',
})

describe('recoverable files', () => {
  it('splits deleted and changed files, sorted by disk and path', () => {
    const { deleted, changed } = recoverableFiles(
      diff([
        { status: 'removed', name: 'z.jpg', disk: 'd2' },
        { status: 'added', name: 'new.jpg', disk: 'd1' },
        { status: 'removed', name: 'b/a.pdf', disk: 'd1' },
        { status: 'updated', name: 'notes.txt', disk: 'd1' },
        { status: 'removed', name: 'nodisk.txt' },
      ]),
    )
    expect(deleted.map((file) => `${file.disk}:${file.path}`)).toEqual([
      'd1:b/a.pdf',
      'd2:z.jpg',
    ])
    expect(changed.map((file) => file.path)).toEqual(['notes.txt'])
    expect(recoverableFiles(undefined)).toEqual({ deleted: [], changed: [] })
  })

  it('searches paths, and disks by their exact name', () => {
    const file = { disk: 'd1', path: 'Photos/Holiday.jpg' }
    expect(matchesSearch(file, 'holiday')).toBe(true)
    expect(matchesSearch(file, ' ')).toBe(true)
    expect(matchesSearch(file, 'd1')).toBe(true)
    expect(matchesSearch(file, 'd2')).toBe(false)
  })
})
