import type { SnapRaidFileInfo } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  diskTotals,
  folderTrail,
  folderView,
  searchFiles,
} from '../protected-files'

const file = (disk: string, name: string, size: number): SnapRaidFileInfo => ({
  disk,
  name,
  size,
  date: '2026/10/01',
  time: '12:00',
})

const FILES = [
  file('d1', 'movies/a.mkv', 700),
  file('d2', 'movies/b.mkv', 300),
  file('d1', 'movies/old/c.mkv', 50),
  file('d2', 'photos/2026/x.jpg', 2000),
  file('d1', 'readme.txt', 1),
]

describe('folderView', () => {
  it('lists the top folders of every disk merged, biggest first, and its own files', () => {
    const view = folderView(FILES, '')
    expect(view.folders).toEqual([
      { name: 'photos', path: 'photos', files: 1, bytes: 2000, disks: ['d2'] },
      {
        name: 'movies',
        path: 'movies',
        files: 3,
        bytes: 1050,
        disks: ['d1', 'd2'],
      },
    ])
    expect(view.files.map((f) => f.name)).toEqual(['readme.txt'])
  })

  it('opens a folder', () => {
    const view = folderView(FILES, 'movies')
    expect(view.folders.map((f) => [f.path, f.files])).toEqual([
      ['movies/old', 1],
    ])
    expect(view.files.map((f) => f.name)).toEqual([
      'movies/a.mkv',
      'movies/b.mkv',
    ])
  })
})

describe('diskTotals', () => {
  it('sums files and bytes per disk, in disk order', () => {
    expect(
      diskTotals([...FILES, file('d10', 'z', 5)]).map((t) => [
        t.disk,
        t.files,
        t.bytes,
      ]),
    ).toEqual([
      ['d1', 3, 751],
      ['d2', 2, 2300],
      ['d10', 1, 5],
    ])
  })
})

describe('searchFiles', () => {
  it('finds paths case-insensitively, a leading slash or not, up to the limit', () => {
    expect(searchFiles(FILES, 'MKV', 2)).toEqual({
      matches: [FILES[0], FILES[1]],
      total: 3,
    })
    expect(searchFiles(FILES, '/photos/2026', 10).total).toBe(1)
    expect(searchFiles(FILES, '  ', 10)).toEqual({ matches: [], total: 0 })
    expect(searchFiles(FILES, 'nothing', 10).total).toBe(0)
  })
})

describe('folderTrail', () => {
  it('lists the folder and its parents', () => {
    expect(folderTrail('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(folderTrail('')).toEqual([])
  })
})
