import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { ConfigBar } from '../components/ConfigBar'
import { ConfigEditor } from '../components/ConfigEditor'
import { PageLayout } from '../components/PageLayout'
import { Badge } from '../components/ui/badge'
import { useConfig } from '../hooks/queries'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/array')({
  // An array other than the selected one, opened from Manage arrays (a hidden one, or while a job runs)
  validateSearch: (search: Record<string, unknown>): { config?: string } =>
    typeof search.config === 'string' ? { config: search.config } : {},
  component: ArrayPage,
})

function ArrayPage() {
  const { config: requested } = Route.useSearch()
  const navigate = useNavigate()
  const { data: config } = useConfig()
  const { selectedConfig } = useSelectedConfig()
  const other = config?.snapraidConfigs.find((c) => c.path === requested)
  const shown =
    other ?? config?.snapraidConfigs.find((c) => c.path === selectedConfig)

  // Picking an array in the sidebar shows that one again
  const previousSelection = useRef(selectedConfig)
  useEffect(() => {
    if (previousSelection.current !== selectedConfig && requested) {
      navigate({ to: '/array', search: {} })
    }
    previousSelection.current = selectedConfig
  }, [selectedConfig, requested, navigate])

  return (
    <PageLayout
      title={
        <>
          <span className="truncate">{shown?.name ?? m.nav_array()}</span>
          {shown && !shown.enabled && (
            <Badge variant="secondary">{m.config_manager_hidden()}</Badge>
          )}
        </>
      }
      description={
        shown && <p className="truncate font-mono text-xs">{shown.path}</p>
      }
    >
      {other ? (
        <ConfigEditor key={other.path} configPath={other.path} />
      ) : (
        <ConfigBar>
          <ConfigEditor key={selectedConfig} configPath={selectedConfig} />
        </ConfigBar>
      )}
    </PageLayout>
  )
}
