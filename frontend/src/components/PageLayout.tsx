import type { ReactNode } from 'react'

interface PageLayoutProps {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export const PageLayout = ({ title, actions, children }: PageLayoutProps) => (
  <main className="min-h-screen bg-gray-50">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900">
          <span className="h-6 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-indigo-500" />
          {title}
        </h1>
        {actions}
      </div>
      <div className="ui-stagger">{children}</div>
    </div>
  </main>
)
