import { useEffect, useState } from 'react'
import { connectWebSocket } from '../lib/api/websocket'
import type { SnapRaidStatus } from '@shared/types'

interface WebSocketState {
  output: string
  currentCommand: string
  isRunning: boolean
  status: SnapRaidStatus | null
}

export const useWebSocketConnection = (onJobComplete: () => void) => {
  const [state, setState] = useState<WebSocketState>({
    output: '',
    currentCommand: '',
    isRunning: false,
    status: null,
  })

  useEffect(() => {
    connectWebSocket({
      onOutput: (chunk: string, command: string) => {
        setState(prev => ({ ...prev, output: prev.output + chunk, currentCommand: command }))
      },
      onComplete: (command: string, exitCode: number) => {
        setState(prev => ({ ...prev, isRunning: false, currentCommand: '' }))
        console.log(`Command ${command} completed with exit code ${exitCode}`)
        onJobComplete()
      },
      onError: (error: string) => {
        setState(prev => ({ ...prev, isRunning: false, currentCommand: '', output: prev.output + `\n\nError: ${error}` }))
        onJobComplete()
      },
      onStatus: (newStatus: SnapRaidStatus) => {
        setState(prev => ({ ...prev, status: newStatus }))
      },
    })
  }, [onJobComplete])

  return {
    ...state,
    setIsRunning: (running: boolean) => setState(prev => ({ ...prev, isRunning: running })),
    setCurrentCommand: (command: string) => setState(prev => ({ ...prev, currentCommand: command })),
    clearOutput: () => setState(prev => ({ ...prev, output: '' })),
    appendOutput: (chunk: string) => setState(prev => ({ ...prev, output: prev.output + chunk })),
  }
}
