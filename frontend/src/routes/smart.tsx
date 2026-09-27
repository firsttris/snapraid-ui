import { createFileRoute } from '@tanstack/react-router'
import { ConfigBar } from '../components/ConfigBar'
import { PageLayout } from '../components/PageLayout'
import { SmartMonitor } from '../components/SmartMonitor'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { getSmart } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/smart')({
  component: SmartPage,
})

function SmartPage() {
  const { selectedConfig } = useSelectedConfig()

  return (
    <PageLayout title={m.nav_smart()}>
      <ConfigBar>
        <SmartMonitor
          key={selectedConfig}
          configPath={selectedConfig}
          onRefresh={() => getSmart(selectedConfig)}
        />
      </ConfigBar>
    </PageLayout>
  )
}
