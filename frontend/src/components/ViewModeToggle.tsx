import * as m from '../paraglide/messages'
import { SegmentedControl } from './SegmentedControl'

interface ViewModeToggleProps {
  viewMode: 'text' | 'visual'
  onViewModeChange: (mode: 'text' | 'visual') => void
}

export const ViewModeToggle = ({
  viewMode,
  onViewModeChange,
}: ViewModeToggleProps) => (
  <SegmentedControl
    options={[
      { value: 'visual', label: m.config_editor_visual_mode() },
      { value: 'text', label: m.config_editor_text_mode() },
    ]}
    value={viewMode}
    onChange={onViewModeChange}
  />
)
