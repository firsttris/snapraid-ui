import { FolderPlus, Pencil, Settings2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useConfig } from '../hooks/queries'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import * as m from '../paraglide/messages'
import { ConfigEditor } from './ConfigEditor'
import { ConfigManager } from './ConfigManager'
import { Select } from './Select'

interface ConfigBarProps {
  disabled?: boolean
  // Rendered only once a config is selected
  children: ReactNode
}

/**
 * Config selection shared by all pages that work on one SnapRAID config,
 * with a first-run guide when no config exists yet
 */
export const ConfigBar = ({ disabled = false, children }: ConfigBarProps) => {
  const { data: config } = useConfig()
  const { selectedConfig, setSelectedConfig } = useSelectedConfig()
  const [openDialog, setOpenDialog] = useState<'manager' | 'editor' | null>(
    null,
  )

  const enabledConfigs = config?.snapraidConfigs.filter((c) => c.enabled) ?? []
  const showOnboarding = config && enabledConfigs.length === 0
  const selectedConfigEntry = enabledConfigs.find(
    (c) => c.path === selectedConfig,
  )

  return (
    <>
      {showOnboarding ? (
        <div className="mb-6 rounded-lg border-2 border-dashed border-blue-200 bg-white p-8 text-center">
          <FolderPlus size={40} className="mx-auto text-blue-500" />
          <h2 className="mt-3 text-xl font-semibold text-gray-900">
            {m.onboarding_title()}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-gray-600">
            {config.snapraidConfigs.length > 0
              ? m.onboarding_all_disabled()
              : m.onboarding_message()}
          </p>
          <button
            type="button"
            onClick={() => setOpenDialog('manager')}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            {m.config_manager_title()}
          </button>
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3 rounded-lg bg-white p-4 shadow sm:flex-row sm:items-center">
          <label
            htmlFor="config-select"
            className="shrink-0 text-sm font-medium text-gray-700"
          >
            {m.config_selector_title()}
          </label>
          <div className="min-w-0 flex-1">
            <Select
              id="config-select"
              value={selectedConfig}
              onChange={setSelectedConfig}
              disabled={disabled || !config}
              options={enabledConfigs.map((cfg) => ({
                value: cfg.path,
                label: cfg.name,
                hint: cfg.path,
              }))}
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setOpenDialog('editor')}
              disabled={!selectedConfig}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={16} />
              {m.config_manager_edit()}
            </button>
            <button
              type="button"
              onClick={() => setOpenDialog('manager')}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings2 size={16} />
              {m.config_manager_title()}
            </button>
          </div>
        </div>
      )}

      {openDialog === 'manager' && config && (
        <ConfigManager
          config={config.snapraidConfigs}
          onClose={() => setOpenDialog(null)}
        />
      )}

      {openDialog === 'editor' && selectedConfigEntry && (
        <ConfigEditor
          configPath={selectedConfigEntry.path}
          configName={selectedConfigEntry.name}
          onClose={() => setOpenDialog(null)}
        />
      )}

      {selectedConfig && children}
    </>
  )
}
