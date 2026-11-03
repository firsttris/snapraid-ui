import type { SnapRaidFileInfo } from '@shared/types'

export interface FolderEntry {
  name: string
  path: string // Without a trailing slash
  files: number // In it and below
  bytes: number
  disks: string[]
}

export interface FolderView {
  folders: FolderEntry[] // Biggest first
  files: SnapRaidFileInfo[] // Directly in the folder, by name
}

export interface DiskTotal {
  disk: string
  files: number
  bytes: number
}

const pathOf = (file: SnapRaidFileInfo) => file.name.replace(/^\/+/, '')

/**
 * One folder of the array as the last sync knows it, the same folder of every disk merged
 * like a pool shows it. '' is the top.
 */
export const folderView = (
  files: SnapRaidFileInfo[],
  folder: string,
): FolderView => {
  const prefix = folder ? `${folder}/` : ''
  const folders = new Map<string, FolderEntry & { diskSet: Set<string> }>()
  const direct: SnapRaidFileInfo[] = []
  for (const file of files) {
    const path = pathOf(file)
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      direct.push(file)
      continue
    }
    const name = rest.slice(0, slash)
    const entry = folders.get(name) ?? {
      name,
      path: prefix + name,
      files: 0,
      bytes: 0,
      disks: [],
      diskSet: new Set<string>(),
    }
    folders.set(name, entry)
    entry.files++
    entry.bytes += file.size
    if (file.disk) entry.diskSet.add(file.disk)
  }
  return {
    folders: [...folders.values()]
      .map(({ diskSet, ...entry }) => ({
        ...entry,
        disks: [...diskSet].sort(),
      }))
      .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name)),
    files: direct.sort((a, b) => pathOf(a).localeCompare(pathOf(b))),
  }
}

/**
 * Files and bytes per data disk, by disk name
 */
export const diskTotals = (files: SnapRaidFileInfo[]): DiskTotal[] => {
  const totals = new Map<string, DiskTotal>()
  for (const file of files) {
    const disk = file.disk ?? ''
    const total = totals.get(disk) ?? { disk, files: 0, bytes: 0 }
    totals.set(disk, total)
    total.files++
    total.bytes += file.size
  }
  return [...totals.values()].sort((a, b) =>
    a.disk.localeCompare(b.disk, undefined, { numeric: true }),
  )
}

/**
 * Files whose path contains the search, case-insensitive: at most `limit` of them, how many
 * match, and on which disks they are
 */
export const searchFiles = (
  files: SnapRaidFileInfo[],
  search: string,
  limit: number,
): { matches: SnapRaidFileInfo[]; total: number; disks: DiskTotal[] } => {
  const needle = search.trim().toLowerCase().replace(/^\/+/, '')
  if (!needle) return { matches: [], total: 0, disks: [] }
  const all = files.filter((file) =>
    pathOf(file).toLowerCase().includes(needle),
  )
  return {
    matches: all.slice(0, limit),
    total: all.length,
    disks: diskTotals(all),
  }
}

/**
 * The folder and its parents, for the breadcrumb: 'a/b' -> ['a', 'a/b']
 */
export const folderTrail = (folder: string): string[] =>
  folder
    .split('/')
    .filter(Boolean)
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'))
