import type { ReactNode } from 'react'

interface PageLayoutProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export const PageLayout = ({
  title,
  description,
  actions,
  children,
}: PageLayoutProps) => (
  <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <div className="mt-1 text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions}
    </div>
    <div className="ui-stagger flex flex-col gap-6">{children}</div>
  </main>
)
