import type { ReactNode } from 'react'

interface SaveBarProps {
  hint?: ReactNode // Left of the buttons, e.g. "unsaved changes"
  children: ReactNode
}

// Save and cancel stay in reach at the bottom of the window while scrolling long forms.
// The page needs bottom padding (SAVE_BAR_SPACE) so its end does not hide behind the bar
export const SAVE_BAR_SPACE = 'pb-20'

export const SaveBar = ({ hint, children }: SaveBarProps) => (
  <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
      {hint && <span className="text-sm text-gray-600">{hint}</span>}
      {children}
    </div>
  </div>
)
