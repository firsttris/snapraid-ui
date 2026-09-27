import type { SnapRaidStatus } from '@shared/types'
import { useEffect, useState } from 'react'
import { connectWebSocket } from '../lib/api/websocket'

export interface JobResult {
  command: string
  exitCode: number | null
  aborted: boolean
  error?: string
  finishedAt: string
}

interface WebSocketState {
  output: string
  currentCommand: string
  isRunning: boolean
  status: SnapRaidStatus | null
  lastResult: JobResult | null
}

export const useWebSocketConnection = (onJobComplete: () => void) => {
  const [state, setState] = useState<WebSocketState>({
    output: '',
    currentCommand: '',
    isRunning: false,
    status: null,
    lastResult: null,
  })

  useEffect(() => {
    connectWebSocket({
      onOutput: (chunk: string, command: string) => {
        setState((prev) => ({
          ...prev,
          output: prev.output + chunk,
          currentCommand: command,
        }))
      },
      onComplete: (command: string, exitCode: number, aborted: boolean) => {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          currentCommand: '',
          lastResult: {
            command,
            exitCode,
            aborted,
            finishedAt: new Date().toISOString(),
          },
        }))
        onJobComplete()
      },
      onError: (error: string, command: string) => {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          currentCommand: '',
          output: `${prev.output}\n\nError: ${error}`,
          lastResult: {
            command,
            exitCode: null,
            aborted: false,
            error,
            finishedAt: new Date().toISOString(),
          },
        }))
        onJobComplete()
      },
      onStatus: (newStatus: SnapRaidStatus) => {
        setState((prev) => ({ ...prev, status: newStatus }))
      },
    })
  }, [onJobComplete])

  return {
    ...state,
    setIsRunning: (running: boolean) =>
      setState((prev) => ({ ...prev, isRunning: running })),
    setCurrentCommand: (command: string) =>
      setState((prev) => ({ ...prev, currentCommand: command })),
    clearOutput: () => setState((prev) => ({ ...prev, output: '' })),
    appendOutput: (chunk: string) =>
      setState((prev) => ({ ...prev, output: prev.output + chunk })),
    setError: (command: string, error: string) =>
      setState((prev) => ({
        ...prev,
        isRunning: false,
        currentCommand: '',
        lastResult: {
          command,
          exitCode: null,
          aborted: false,
          error,
          finishedAt: new Date().toISOString(),
        },
      })),
  }
}
