import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectWebSocket, disconnectWebSocket } from '../lib/api-client'

import { Header } from '../components/Header'

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
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>404</h1>
      <p style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Page not found</p>
      <Link to="/" style={{ color: '#0066cc', textDecoration: 'underline' }}>
        Go back home
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
        title: 'SnapRAID UI',
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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <Header />
          {children}
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
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
