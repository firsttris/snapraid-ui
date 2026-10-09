import { Link } from '@tanstack/react-router'
import { FolderPlus, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConfig, useConfigChecks } from '../hooks/queries'
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
  // On the first start config.json points to snapraid.conf in the data folder, which is
  // there once you copy yours in; until then there is nothing to show either
  const { data: checks } = useConfigChecks({
    enabled: enabledConfigs.length > 0,
  })
  const noFile =
    enabledConfigs.length > 0 &&
    !!checks &&
    enabledConfigs.every(
      (c) => checks.find((check) => check.path === c.path)?.exists === false,
    )
  const allDisabled =
    !!config && config.snapraidConfigs.length > 0 && enabledConfigs.length === 0
  const showOnboarding =
    !!config && (config.snapraidConfigs.length === 0 || allDisabled || noFile)

  if (config && showOnboarding) {
    return (
      <Card className="items-center border-2 border-dashed px-8 py-10 text-center shadow-none">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <FolderPlus className="size-7 text-muted-foreground" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">{m.onboarding_title()}</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            {allDisabled
              ? m.onboarding_all_disabled()
              : noFile
                ? m.onboarding_no_file()
                : m.onboarding_message()}
          </p>
        </div>
        {allDisabled ? (
          <Button size="lg" onClick={() => openConfigDialog('manager')}>
            {m.config_manager_title()}
          </Button>
        ) : (
          // No config yet: set up a new array, or add the snapraid.conf you have
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/setup">
                <Sparkles />
                {m.setup_new_button()}
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => openConfigDialog('manager')}
            >
              {m.setup_existing_button()}
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return selectedConfig ? children : null
}
