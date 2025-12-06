import * as m from '../paraglide/messages'

interface ConfigEditorFooterProps {
  viewMode: 'text' | 'visual'
  hasChanges: boolean
  validating: boolean
  saving: boolean
  loading: boolean
  onValidate: () => void
  onSave: () => void
  onClose: () => void
}

export const ConfigEditorFooter = ({ 
  viewMode, 
  hasChanges, 
  validating, 
  saving, 
  loading, 
  onValidate, 
  onSave, 
  onClose 
}: ConfigEditorFooterProps) => {
  return (
    <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
      <button
        onClick={onValidate}
        disabled={validating || loading}
        className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {validating ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {m.config_editor_validating()}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {m.config_editor_validate()}
          </>
        )}
      </button>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          {m.common_cancel()}
        </button>
        {viewMode === 'text' && (
          <button
            onClick={onSave}
            disabled={!hasChanges || saving || loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {m.config_editor_saving()}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {m.config_editor_save_config()}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
