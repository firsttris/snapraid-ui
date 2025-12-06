import type { AppConfig } from '@shared/types'

interface ConfigSelectorProps {
  config: AppConfig['snapraidConfigs']
  selectedConfig: string
  onSelect: (path: string) => void
  disabled?: boolean
  onManageClick: () => void
}

export function ConfigSelector({ 
  config, 
  selectedConfig, 
  onSelect, 
  disabled = false,
  onManageClick 
}: ConfigSelectorProps) {
  const enabledConfigs = config.filter(c => c.enabled)

  return (
    <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Active Configuration</h2>
        <button
          onClick={onManageClick}
          className="px-4 py-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Manage Configs
        </button>
      </div>
      
      <div className="relative group">
        <select
          value={selectedConfig}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
          className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
        >
          <option value="">Select a configuration...</option>
          {enabledConfigs.map((cfg) => (
            <option key={cfg.path} value={cfg.path}>
              {cfg.name} — {cfg.path}
            </option>
          ))}
        </select>
        
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {!selectedConfig && (
        <p className="mt-3 text-sm text-gray-500 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Please select a configuration to begin
        </p>
      )}
    </div>
  )
}
