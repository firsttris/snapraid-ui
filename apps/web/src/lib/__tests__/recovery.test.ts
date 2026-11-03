import type { DiffReport } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  folderTotals,
  matchesSearch,
  otherChanges,
  recoverableFiles,
} from '../recovery'

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

describe('other changes', () => {
  it('new files apart from moved, copied and restored ones', () => {
    const { added, other } = otherChanges(
      diff([
        { status: 'added', disk: 'd2', name: 'b.mkv', size: 10 },
        { status: 'added', disk: 'd1', name: 'a.mkv' },
        { status: 'moved', disk: 'd1', name: 'x -> y' },
        { status: 'removed', disk: 'd1', name: 'gone' },
        { status: 'copied', disk: 'd2', name: 'p -> q' },
      ]),
    )
    expect(added.map((file) => file.path)).toEqual(['a.mkv', 'b.mkv'])
    expect(added[1].size).toBe(10)
    expect(other.map((file) => file.status)).toEqual(['moved', 'copied'])
  })

  it('totals per top folder, the largest first', () => {
    expect(
      folderTotals([
        { path: 'movies/a/x.mkv', size: 100, status: 'added' },
        { path: 'movies/b.mkv', size: 50, status: 'added' },
        { path: 'music/s.flac', size: 30, status: 'added' },
        { path: 'loose.txt', status: 'added' },
      ]),
    ).toEqual([
      { folder: 'movies', files: 2, bytes: 150, sized: true },
      { folder: 'music', files: 1, bytes: 30, sized: true },
      { folder: '', files: 1, bytes: 0, sized: false },
    ])
  })

  it('one top folder only: its subfolders', () => {
    expect(
      folderTotals([
        { path: 'media/movies/x.mkv', size: 100, status: 'added' },
        { path: 'media/music/s.flac', size: 30, status: 'added' },
      ]).map((total) => total.folder),
    ).toEqual(['media/movies', 'media/music'])
  })
})
