import type { ReactNode } from 'react'

interface SaveBarProps {
  hint?: ReactNode // Left of the buttons, e.g. "unsaved changes"
  children: ReactNode
}

// Save and cancel stay in reach at the bottom of the window while scrolling long forms.
// The bar is sticky inside the page flow, so it never covers the sidebar and needs no extra page padding;
// SAVE_BAR_SPACE stays for callers that still add it
export const SAVE_BAR_SPACE = ''

export const SaveBar = ({ hint, children }: SaveBarProps) => (
  <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t bg-background/90 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
    {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    {children}
  </div>
)
