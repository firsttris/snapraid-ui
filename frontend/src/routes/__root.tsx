import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { AuthGate } from '../components/AuthGate'
import { FeedbackProvider } from '../components/Feedback'
import { Header } from '../components/Header'
import { queryKeys, STATUS_CACHE_MAX_AGE } from '../hooks/queries'
import { SelectedConfigProvider } from '../hooks/useSelectedConfig'
import { THEME_INIT_SCRIPT } from '../lib/theme'
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

// No storage during SSR or when the browser blocks it, the cache then just is not persisted
const browserStorage = (() => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
})()

const persister = createSyncStoragePersister({
  storage: browserStorage,
  key: 'snapraid-ui-query-cache',
})

const persistOptions = {
  persister,
  maxAge: STATUS_CACHE_MAX_AGE,
  // Bump when the persisted data shape changes
  buster: '1',
  dehydrateOptions: {
    // Only the status is persisted; kept after a busy refetch too, which leaves its last data in place
    shouldDehydrateQuery: (query: {
      queryKey: readonly unknown[]
      state: { data: unknown }
    }) =>
      query.queryKey[0] === queryKeys.status[0] &&
      query.state.data !== undefined,
  },
}

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
  return (
    // The init script sets data-theme before React hydrates
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static script, sets the theme before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <AuthGate>
            <FeedbackProvider>
              <SelectedConfigProvider>
                <Header />
                {children}
              </SelectedConfigProvider>
            </FeedbackProvider>
          </AuthGate>
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
        </PersistQueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
