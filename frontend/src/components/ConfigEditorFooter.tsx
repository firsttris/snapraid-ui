import { CircleCheck, Loader2, Save } from 'lucide-react'
import * as m from '../paraglide/messages'
import { Button } from './Button'

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
  onClose,
}: ConfigEditorFooterProps) => {
  return (
    <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
      <Button
        variant="secondary"
        onClick={onValidate}
        disabled={validating || loading}
      >
        {validating ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <CircleCheck size={16} />
        )}
        {validating ? m.config_editor_validating() : m.config_editor_validate()}
      </Button>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onClose}>
          {/* The visual editor saves every change, there is nothing to cancel */}
          {viewMode === 'visual' ? m.common_close() : m.common_cancel()}
        </Button>
        {viewMode === 'text' && (
          <Button onClick={onSave} disabled={!hasChanges || saving || loading}>
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {saving ? m.config_editor_saving() : m.config_editor_save_config()}
          </Button>
        )}
      </div>
    </div>
  )
}
