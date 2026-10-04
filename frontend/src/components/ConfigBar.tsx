import { FolderPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConfig } from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import { Card } from './ui/card'

interface ConfigBarProps {
  // Rendered only once a config is selected
  children: ReactNode
}

/**
 * Gate of the pages that work on one SnapRAID config, with a first-run guide
 * when no config exists yet. The config itself is picked in the sidebar.
 */
export const ConfigBar = ({ children }: ConfigBarProps) => {
  const { data: config } = useConfig()
  const { selectedConfig } = useSelectedConfig()
  const { openConfigDialog } = useAppShell()

  const enabledConfigs = config?.snapraidConfigs.filter((c) => c.enabled) ?? []
  const showOnboarding = config && enabledConfigs.length === 0

  if (showOnboarding) {
    return (
      <Card className="items-center border-2 border-dashed px-8 py-10 text-center shadow-none">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <FolderPlus className="size-7 text-muted-foreground" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">{m.onboarding_title()}</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            {config.snapraidConfigs.length > 0
              ? m.onboarding_all_disabled()
              : m.onboarding_message()}
          </p>
        </div>
        <Button size="lg" onClick={() => openConfigDialog('manager')}>
          {m.config_manager_title()}
        </Button>
      </Card>
    )
  }

  return selectedConfig ? children : null
}
