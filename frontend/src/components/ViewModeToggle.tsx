import * as m from '../paraglide/messages'

interface ViewModeToggleProps {
  viewMode: 'text' | 'visual'
  onViewModeChange: (mode: 'text' | 'visual') => void
}

export const ViewModeToggle = ({ viewMode, onViewModeChange }: ViewModeToggleProps) => {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => onViewModeChange('visual')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'visual'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {m.config_editor_visual_mode()}
      </button>
      <button
        onClick={() => onViewModeChange('text')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'text'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {m.config_editor_text_mode()}
      </button>
    </div>
  )
}
