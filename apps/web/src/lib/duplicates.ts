import type { DuplicateDeletion, DuplicateFile } from '@shared/types'

export interface DuplicateCopy {
  disk: string
  path: string
  key: string
}

// Files with the same content, the one SnapRAID found first leads
export interface DuplicateGroup {
  id: string
  size: number // Of each copy
  copies: DuplicateCopy[]
  wasted: number // What deleting all but one copy frees
}

// Which copy stays: the one found first, or the one with the shortest path
export type KeepRule = 'first' | 'shortest'

const keyOf = (disk: string, path: string) => `${disk}\u0000${path}`

/**
 * Group dup's report by content. Each duplicate names an earlier file with the same content,
 * followed to the first one; copies no longer on their disk are left out, and so are groups
 * with a single copy left.
 */
export const duplicateGroups = (
  files: DuplicateFile[] | undefined,
): DuplicateGroup[] => {
  const parent = new Map<string, string>()
  const copies = new Map<string, DuplicateCopy & { gone: boolean }>()
  const add = (disk: string, path: string, gone: boolean) => {
    const key = keyOf(disk, path)
    const known = copies.get(key)
    if (known) known.gone ||= gone
    else copies.set(key, { disk, path, key, gone })
    return key
  }
  const sizes = new Map<string, number>()
  for (const file of files ?? []) {
    const key = add(file.disk, file.name, !!file.gone)
    const original = add(
      file.originalDisk,
      file.originalName,
      !!file.originalGone,
    )
    if (key !== original) parent.set(key, original)
    sizes.set(key, file.size)
  }
  const root = (key: string) => {
    const seen = new Set<string>()
    let current = key
    while (parent.has(current) && !seen.has(current)) {
      seen.add(current)
      current = parent.get(current) as string
    }
    return current
  }

  const groups = new Map<string, DuplicateGroup>()
  for (const copy of copies.values()) {
    const id = root(copy.key)
    const group = groups.get(id) ?? { id, size: 0, copies: [], wasted: 0 }
    groups.set(id, group)
    group.size = Math.max(group.size, sizes.get(copy.key) ?? 0)
    if (!copy.gone)
      group.copies.push({ disk: copy.disk, path: copy.path, key: copy.key })
  }
  return [...groups.values()]
    .filter((group) => group.copies.length > 1)
    .map((group) => {
      // The first one found leads, the others by disk and path
      const sorted = group.copies.sort(
        (a, b) =>
          Number(b.key === group.id) - Number(a.key === group.id) ||
          a.disk.localeCompare(b.disk) ||
          a.path.localeCompare(b.path),
      )
      return {
        ...group,
        copies: sorted,
        wasted: group.size * (sorted.length - 1),
      }
    })
    .sort((a, b) => b.wasted - a.wasted || a.id.localeCompare(b.id))
}

/**
 * The copy that stays: the first match of the preferred text in its path, else by the rule
 */
export const keptCopy = (
  group: DuplicateGroup,
  rule: KeepRule,
  prefer = '',
): DuplicateCopy => {
  const needle = prefer.trim().toLowerCase()
  const preferred =
    needle &&
    group.copies.find((copy) =>
      `${copy.disk}/${copy.path}`.toLowerCase().includes(needle),
    )
  if (preferred) return preferred
  if (rule === 'shortest') {
    return group.copies.reduce((best, copy) =>
      copy.path.length < best.path.length ? copy : best,
    )
  }
  return group.copies[0]
}

/**
 * Every copy of the group but the one that stays
 */
export const deletionsOf = (
  group: DuplicateGroup,
  keep: DuplicateCopy,
): DuplicateDeletion[] =>
  group.copies
    .filter((copy) => copy.key !== keep.key)
    .map((copy) => ({
      disk: copy.disk,
      path: copy.path,
      keepDisk: keep.disk,
      keepPath: keep.path,
      size: group.size,
    }))

export const matchesGroup = (group: DuplicateGroup, search: string) => {
  const needle = search.trim().toLowerCase()
  return (
    !needle ||
    group.copies.some(
      (copy) =>
        copy.path.toLowerCase().includes(needle) ||
        copy.disk.toLowerCase() === needle,
    )
  )
}
