import type { DuplicateFile } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  deletionsOf,
  duplicateGroups,
  keptCopy,
  matchesGroup,
} from '../duplicates'

const dup = (
  disk: string,
  name: string,
  originalDisk: string,
  originalName: string,
  size: number,
  extra: Partial<DuplicateFile> = {},
): DuplicateFile => ({ disk, name, originalDisk, originalName, size, ...extra })

describe('duplicateGroups', () => {
  it('groups copies by content, the first found leads, most space first', () => {
    const groups = duplicateGroups([
      dup('d2', 'backup/a.mkv', 'd1', 'movies/a.mkv', 100),
      dup('d1', 'old/a.mkv', 'd1', 'movies/a.mkv', 100),
      dup('d2', 'b.jpg', 'd1', 'photos/b.jpg', 500),
    ])
    expect(groups.map((group) => group.copies.map((c) => c.path))).toEqual([
      ['photos/b.jpg', 'b.jpg'],
      ['movies/a.mkv', 'old/a.mkv', 'backup/a.mkv'],
    ])
    expect(groups.map((group) => [group.size, group.wasted])).toEqual([
      [500, 500],
      [100, 200],
    ])
  })

  it('follows a duplicate of a duplicate to the first file', () => {
    const groups = duplicateGroups([
      dup('d1', 'b', 'd1', 'a', 10),
      dup('d1', 'c', 'd1', 'b', 10),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].copies.map((c) => c.path)).toEqual(['a', 'b', 'c'])
  })

  it('leaves out copies that are gone, and groups with one copy left', () => {
    const groups = duplicateGroups([
      dup('d1', 'b', 'd1', 'a', 10, { gone: true }),
      dup('d1', 'y', 'd1', 'x', 10, { originalGone: true }),
      dup('d1', 'z', 'd1', 'x', 10, { originalGone: true }),
    ])
    expect(groups.map((group) => group.copies.map((c) => c.path))).toEqual([
      ['y', 'z'],
    ])
    expect(groups[0].wasted).toBe(10)
  })
})

describe('keptCopy and deletionsOf', () => {
  const [group] = duplicateGroups([
    dup('d2', 'backup/2024/movies/a.mkv', 'd1', 'movies/long-name/a.mkv', 7),
    dup('d1', 'a.mkv', 'd1', 'movies/long-name/a.mkv', 7),
  ])

  it('keeps the first found, the shortest path, or the preferred one', () => {
    expect(keptCopy(group, 'first').path).toBe('movies/long-name/a.mkv')
    expect(keptCopy(group, 'shortest').path).toBe('a.mkv')
    expect(keptCopy(group, 'shortest', 'BACKUP/').path).toBe(
      'backup/2024/movies/a.mkv',
    )
    // Also matches the disk
    expect(keptCopy(group, 'first', 'd2/').disk).toBe('d2')
    // No match: the rule decides
    expect(keptCopy(group, 'first', 'nowhere').path).toBe(
      'movies/long-name/a.mkv',
    )
  })

  it('deletes every other copy, naming the one that stays', () => {
    expect(deletionsOf(group, keptCopy(group, 'shortest'))).toEqual([
      {
        disk: 'd1',
        path: 'movies/long-name/a.mkv',
        keepDisk: 'd1',
        keepPath: 'a.mkv',
        size: 7,
      },
      {
        disk: 'd2',
        path: 'backup/2024/movies/a.mkv',
        keepDisk: 'd1',
        keepPath: 'a.mkv',
        size: 7,
      },
    ])
  })

  it('matches a search in any copy path or a disk name', () => {
    expect(matchesGroup(group, 'backup')).toBe(true)
    expect(matchesGroup(group, 'D2')).toBe(true)
    expect(matchesGroup(group, 'd')).toBe(false)
    expect(matchesGroup(group, '')).toBe(true)
  })
})
