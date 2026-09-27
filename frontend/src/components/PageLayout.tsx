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
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  </main>
)
