import { CircleCheck, Loader2, Save } from 'lucide-react'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'

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
}: ConfigEditorFooterProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-4 sm:px-6 sm:rounded-b-xl">
    <Button
      variant="outline"
      onClick={onValidate}
      disabled={validating || loading}
    >
      {validating ? <Loader2 className="animate-spin" /> : <CircleCheck />}
      {validating ? m.config_editor_validating() : m.config_editor_validate()}
    </Button>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={onClose}>
        {/* The visual editor saves every change, there is nothing to cancel */}
        {viewMode === 'visual' ? m.common_close() : m.common_cancel()}
      </Button>
      {viewMode === 'text' && (
        <Button onClick={onSave} disabled={!hasChanges || saving || loading}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? m.config_editor_saving() : m.config_editor_save_config()}
        </Button>
      )}
    </div>
  </div>
)
