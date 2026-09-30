import { useQueryClient } from '@tanstack/react-query'
import { HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { queryKeys, useSession } from '../hooks/queries'
import { UNAUTHORIZED_EVENT } from '../lib/api/constants'
import { connectWebSocket, disconnectWebSocket } from '../lib/api/websocket'
import * as m from '../paraglide/messages'
import { LoginPage } from './LoginPage'

const FullScreen = ({ children }: { children: ReactNode }) => (
  <main className="theme-fixed flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-gray-400">
    <HardDrive size={32} className="text-cyan-400" />
    {children}
  </main>
)

/**
 * Renders the app only once the user is logged in, or when the backend has no login configured
 */
export const AuthGate = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const {
    data: session,
    isPending,
    isError,
    refetch,
    isFetching,
  } = useSession()
  const authenticated = session?.authenticated === true

  // Any API call rejected with 401 (e.g. expired session) sends the user back to the login
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [queryClient])

  // WebSocket once at root level to persist across route changes, routes set their own handlers
  useEffect(() => {
    if (!authenticated) return
    connectWebSocket()
    return () => disconnectWebSocket()
  }, [authenticated])

  if (isPending) {
    return (
      <FullScreen>
        <Loader2 size={20} className="animate-spin" />
      </FullScreen>
    )
  }

  if (isError) {
    return (
      <FullScreen>
        <p>{m.login_server_error()}</p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          {m.login_retry()}
        </button>
      </FullScreen>
    )
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={(newSession) =>
          queryClient.setQueryData(queryKeys.session, newSession)
        }
      />
    )
  }

  return children
}
