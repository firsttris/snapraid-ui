// SnapRAID arrays for the tests: directories as disks, a config and, if asked, a first sync
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { ARRAYS, SNAPRAID } from './env'

const run = promisify(execFile)

export interface ArrayOptions {
  dataDisks?: string[]
  // Relative path on a data disk and its size in KiB
  files?: Record<string, Record<string, number>>
  // Run a first sync, so parity covers the files
  synced?: boolean
  // SnapRAID that runs the first sync, called with --test-skip-device
  snapraid?: string
}

export interface TestArray {
  name: string
  dir: string
  configPath: string
  // The path as SnapRAID UI stores it: absolute, the arrays are outside its base path
  storedPath: string
  dataDisks: string[]
  disk: (name: string) => string
  writeFile: (disk: string, path: string, kib: number) => Promise<void>
  readFile: (disk: string, path: string) => Promise<Buffer>
  // Runs SnapRAID on the array directly, not through the UI
  snapraid: (...args: string[]) => Promise<string>
  // Bit rot: other bytes in the middle of a file, same size and timestamp, so it still counts as synced
  corrupt: (disk: string, path: string) => Promise<void>
  // Moves a data disk's files away and back, as if it was unmounted
  unmount: (disk: string) => Promise<void>
  remount: (disk: string) => Promise<void>
}

export const DEFAULT_FILES: Record<string, Record<string, number>> = {
  d1: { 'photos/holiday.jpg': 300, 'photos/birthday.jpg': 200, 'documents/contract.pdf': 80 },
  d2: { 'movies/trailer.mkv': 400, 'music/song.flac': 150 },
}

const randomFile = async (path: string, kib: number) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, randomBytes(kib * 1024))
}

export const createArray = async (name: string, options: ArrayOptions = {}): Promise<TestArray> => {
  const dataDisks = options.dataDisks ?? ['d1', 'd2']
  const files = options.files ?? DEFAULT_FILES
  const dir = join(ARRAYS, name)
  const disk = (diskName: string) => join(dir, 'disks', diskName)
  const configPath = join(dir, 'snapraid.conf')

  await rm(dir, { recursive: true, force: true })
  for (const diskName of dataDisks) await mkdir(disk(diskName), { recursive: true })
  await mkdir(join(dir, 'parity'), { recursive: true })
  await mkdir(join(dir, 'content'), { recursive: true })
  for (const [diskName, entries] of Object.entries(files)) {
    for (const [path, kib] of Object.entries(entries)) await randomFile(join(disk(diskName), path), kib)
  }

  // Content files outside the data disks, emptying a disk must not take one away
  await writeFile(
    configPath,
    [
      `parity ${join(dir, 'parity', 'snapraid.parity')}`,
      `content ${join(dir, 'parity', 'snapraid.content')}`,
      `content ${join(dir, 'content', 'snapraid.content')}`,
      ...dataDisks.map((diskName) => `data ${diskName} ${disk(diskName)}/`),
      'exclude *.unrecoverable',
      'blocksize 64',
      '',
    ].join('\n'),
  )

  const array = openArray(name, { dataDisks, snapraid: options.snapraid })
  if (options.synced ?? true) await array.snapraid('sync')
  return array
}

/**
 * An array createArray made, e.g. the one of snapraid-daemon in the global setup
 */
export const openArray = (name: string, options: Pick<ArrayOptions, 'dataDisks' | 'snapraid'> = {}): TestArray => {
  const dataDisks = options.dataDisks ?? ['d1', 'd2']
  const dir = join(ARRAYS, name)
  const disk = (diskName: string) => join(dir, 'disks', diskName)
  const configPath = join(dir, 'snapraid.conf')

  const snapraid = async (...args: string[]) => {
    const { stdout, stderr } = await run(
      options.snapraid ?? SNAPRAID,
      ['--test-skip-device', '-c', configPath, ...args],
      { maxBuffer: 16 * 1024 * 1024 },
    )
    return stdout + stderr
  }
  const parked = (diskName: string) => join(dir, 'unmounted', diskName)
  return {
    name,
    dir,
    configPath,
    storedPath: configPath,
    dataDisks,
    disk,
    writeFile: (diskName, path, kib) => randomFile(join(disk(diskName), path), kib),
    readFile: (diskName, path) => readFile(join(disk(diskName), path)),
    snapraid,
    corrupt: async (diskName, path) => {
      const file = join(disk(diskName), path)
      // touch -r keeps the nanoseconds, SnapRAID compares them; Node's utimes would round them
      const reference = join(dir, 'timestamp')
      await run('touch', ['-r', file, reference])
      const handle = await open(file, 'r+')
      const { size } = await handle.stat()
      await handle.write(Buffer.alloc(4096, 0xab), 0, 4096, Math.floor(size / 2))
      await handle.close()
      await run('touch', ['-r', reference, file])
      await rm(reference)
    },
    unmount: async (diskName) => {
      await mkdir(join(dir, 'unmounted'), { recursive: true })
      await rename(disk(diskName), parked(diskName))
      await mkdir(disk(diskName))
    },
    remount: async (diskName) => {
      await rm(disk(diskName), { recursive: true })
      await rename(parked(diskName), disk(diskName))
    },
  }
}
