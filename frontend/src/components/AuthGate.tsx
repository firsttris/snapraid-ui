import { useQueryClient } from '@tanstack/react-query'
import { HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { queryKeys, useSession } from '../hooks/queries'
import { UNAUTHORIZED_EVENT } from '../lib/api/constants'
import { connectWebSocket, disconnectWebSocket } from '../lib/api/websocket'
import * as m from '../paraglide/messages'
import { LoginPage } from './LoginPage'
import { Button } from './ui/button'

const FullScreen = ({ children }: { children: ReactNode }) => (
  <main className="theme-fixed flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-sm text-gray-400">
    <div className="flex size-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-indigo-500/20">
      <HardDrive className="size-7 text-cyan-300" />
    </div>
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
        <Loader2 className="size-5 animate-spin" />
      </FullScreen>
    )
  }

  if (isError) {
    return (
      <FullScreen>
        <p>{m.login_server_error()}</p>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-white/10 bg-transparent text-gray-200 hover:bg-white/10 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/10"
        >
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          {m.login_retry()}
        </Button>
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
