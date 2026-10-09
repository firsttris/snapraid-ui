// The processes of a test run and the proxy in front of them
import { type ChildProcess, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
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

/**
 * Sends /api and /ws to the backend and the rest to the frontend, as nginx does in the Docker image
 */
export const startProxy = (port: number, frontendPort: number, backendPort: number): Promise<Server> => {
  const target = (url = '/') => (/^\/(api|ws)(\/|$|\?)/.test(url) ? backendPort : frontendPort)

  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: target(req.url), path: req.url, method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
      },
    )
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })

  // WebSocket: pass the handshake on and then the bytes both ways
  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(target(req.url), '127.0.0.1', () => {
      const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`)
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`)
      upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  const sockets = new Set<net.Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () =>
      resolve({
        name: 'proxy',
        stop: () =>
          new Promise((done) => {
            sockets.forEach((socket) => socket.destroy())
            server.close(() => done())
          }),
      }),
    )
  })
}
