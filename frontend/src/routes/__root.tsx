import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { FeedbackProvider } from '../components/Feedback'
import { Header } from '../components/Header'
import { SelectedConfigProvider } from '../hooks/useSelectedConfig'
import { connectWebSocket, disconnectWebSocket } from '../lib/api/websocket'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

import appCss from '../styles.css?url'

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10, // 10 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export const Route = createRootRoute({
  notFoundComponent: () => (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>
        {m.not_found_title()}
      </h1>
      <p style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        {m.not_found_message()}
      </p>
      <Link to="/" style={{ color: '#0066cc', textDecoration: 'underline' }}>
        {m.not_found_go_home()}
      </Link>
    </div>
  ),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: m.app_title(),
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Initialize WebSocket once at root level to persist across route changes
  useEffect(() => {
    // Connect with empty handlers - individual routes will update them
    connectWebSocket({})

    return () => {
      disconnectWebSocket()
    }
  }, [])

  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <FeedbackProvider>
            <SelectedConfigProvider>
              <Header />
              {children}
            </SelectedConfigProvider>
          </FeedbackProvider>
          {import.meta.env.DEV && (
            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          )}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
