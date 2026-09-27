import { createFileRoute } from '@tanstack/react-router'
import { ConfigBar } from '../components/ConfigBar'
import { DiskPowerControl } from '../components/DiskPowerControl'
import { PageLayout } from '../components/PageLayout'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { probe, spinDown, spinUp } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/power')({
  component: PowerPage,
})

function PowerPage() {
  const { selectedConfig } = useSelectedConfig()

  return (
    <PageLayout title={m.nav_power()}>
      <ConfigBar>
        <DiskPowerControl
          key={selectedConfig}
          configPath={selectedConfig}
          onProbe={() => probe(selectedConfig)}
          onSpinUp={(disks) => spinUp(selectedConfig, disks)}
          onSpinDown={(disks) => spinDown(selectedConfig, disks)}
        />
      </ConfigBar>
    </PageLayout>
  )
}
