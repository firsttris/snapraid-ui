// The processes of a test run
import { type ChildProcess, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { RUN_DIR } from './env'

export interface Server {
  name: string
  stop: () => Promise<void>
}

/**
 * Starts a process with its output in .run/<name>.log and waits until `ready` answers
 */
export const startProcess = async (
  name: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; ready: () => Promise<boolean>; timeoutMs?: number },
): Promise<Server> => {
  const log = createWriteStream(join(RUN_DIR, `${name}.log`))
  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)
  let exited: number | null = null
  child.on('exit', (code) => {
    exited = code ?? -1
  })

  const deadline = Date.now() + (options.timeoutMs ?? 60_000)
  while (!(await options.ready().catch(() => false))) {
    if (exited !== null) throw new Error(`${name} exited with ${exited}, see e2e/.run/${name}.log`)
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error(`${name} did not start, see e2e/.run/${name}.log`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return {
    name,
    stop: () =>
      new Promise((resolve) => {
        if (exited !== null) return resolve()
        const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        child.kill('SIGTERM')
      }),
  }
}

export const answers = (url: string) => async () => (await fetch(url)).status < 500
