import type { SnapRaidStatus } from '@shared/types'
import { WS_URL } from './constants'

// WebSocket state
const wsState = {
  ws: null as WebSocket | null,
  reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
  shouldReconnect: true,
  handlers: {} as {
    onOutput?: (chunk: string, command: string) => void
    // Output of a job that was already running when the connection opened, replaces what is shown
    onReplay?: (output: string, command: string, processId: string) => void
    onComplete?: (
      command: string,
      exitCode: number,
      aborted: boolean,
      processId?: string,
    ) => void
    onError?: (error: string, command: string, processId?: string) => void
    onStatus?: (status: SnapRaidStatus) => void
  },
}

/**
 * Connect to WebSocket for live updates; without handlers the current ones are kept
 */
export const connectWebSocket = (handlers?: typeof wsState.handlers): void => {
  // Update handlers
  if (handlers) wsState.handlers = handlers

  // If already connected, just update handlers and return
  if (wsState.ws && wsState.ws.readyState === WebSocket.OPEN) {
    return
  }

  // If connecting, wait for it
  if (wsState.ws && wsState.ws.readyState === WebSocket.CONNECTING) {
    return
  }

  // Clear any pending reconnection
  if (wsState.reconnectTimeout) {
    clearTimeout(wsState.reconnectTimeout)
    wsState.reconnectTimeout = null
  }

  // Close existing connection if any (shouldn't happen with above checks)
  if (wsState.ws) {
    wsState.shouldReconnect = false
    wsState.ws.close()
    wsState.ws = null
  }

  wsState.shouldReconnect = true
  wsState.ws = new WebSocket(WS_URL)

  wsState.ws.onopen = () => {
    console.log('WebSocket connected')
  }

  wsState.ws.onmessage = (event) => {
    const message = JSON.parse(event.data)

    switch (message.type) {
      case 'output':
        wsState.handlers.onOutput?.(message.chunk, message.command)
        break
      case 'replay':
        wsState.handlers.onReplay?.(
          message.output,
          message.command,
          message.processId,
        )
        break
      case 'complete':
        wsState.handlers.onComplete?.(
          message.command,
          message.exitCode,
          message.aborted ?? false,
          message.processId,
        )
        break
      case 'error':
        wsState.handlers.onError?.(
          message.error,
          message.command,
          message.processId,
        )
        break
      case 'status':
        wsState.handlers.onStatus?.(message.status)
        break
    }
  }

  wsState.ws.onerror = () => {
    // errors are followed by onclose, which handles reconnecting
  }

  wsState.ws.onclose = () => {
    console.log('WebSocket disconnected')
    // Only reconnect if we should (i.e., not manually disconnected)
    if (wsState.shouldReconnect) {
      wsState.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...')
        connectWebSocket(wsState.handlers)
      }, 3000)
    }
  }
}

/**
 * Disconnect WebSocket
 */
export const disconnectWebSocket = (): void => {
  wsState.shouldReconnect = false

  if (wsState.reconnectTimeout) {
    clearTimeout(wsState.reconnectTimeout)
    wsState.reconnectTimeout = null
  }

  if (wsState.ws) {
    wsState.ws.close()
    wsState.ws = null
  }
}
