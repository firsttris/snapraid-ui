import { type RefObject, useEffect, useRef } from 'react'

// Open dialogs, newest last. Only the topmost one reacts to keys, so Escape closes one dialog at a time
const openDialogs: symbol[] = []

/**
 * Keeps Tab inside the dialog and closes it on Escape
 */
export const useDialogKeys = (
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) => {
  // Latest onClose without re-running the effect, which would move the focus
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = Symbol('dialog')
    openDialogs.push(id)
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id || event.defaultPrevented)
        return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [href], [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      openDialogs.splice(openDialogs.indexOf(id), 1)
      previousFocus?.focus()
    }
  }, [dialogRef])
}
