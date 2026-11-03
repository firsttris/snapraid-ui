import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react'
import { toast as sonner } from 'sonner'
import { localizeServer } from '../lib/i18n'
import * as m from '../paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Toaster } from './ui/sonner'

// How long a toast stays visible, errors stay longer so they can be read
const TOAST_DURATION_MS = 5000
const ERROR_TOAST_DURATION_MS = 10000

type ToastKind = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

interface FeedbackContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  toast: Record<ToastKind, (message: string, action?: ToastAction) => void>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

/**
 * Error message of an unknown thrown value
 */
export const errorMessage = (error: unknown): string =>
  localizeServer(error instanceof Error ? error.message : String(error))

const show = (kind: ToastKind, message: string, action?: ToastAction) => {
  sonner[kind](message, {
    duration: kind === 'error' ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS,
    action: action && { label: action.label, onClick: action.onClick },
  })
}

const TOAST: FeedbackContextValue['toast'] = {
  success: (message, action) => show('success', message, action),
  error: (message, action) => show('error', message, action),
  info: (message, action) => show('info', message, action),
}

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  )
  // Kept while the dialog animates out, so its text doesn't vanish first
  const [open, setOpen] = useState(false)

  const [value] = useState<FeedbackContextValue>(() => ({
    confirm: (options) =>
      new Promise<boolean>((resolve) => {
        setPendingConfirm({ ...options, resolve })
        setOpen(true)
      }),
    toast: TOAST,
  }))

  const answer = useCallback(
    (confirmed: boolean) => {
      pendingConfirm?.resolve(confirmed)
      setOpen(false)
    },
    [pendingConfirm],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) answer(false)
        }}
      >
        {pendingConfirm && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingConfirm.title ?? m.confirm_title()}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">
                {pendingConfirm.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => answer(false)}>
                {m.confirm_cancel()}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={pendingConfirm.danger ? 'destructive' : 'default'}
                onClick={() => answer(true)}
              >
                {pendingConfirm.confirmLabel ?? m.confirm_ok()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
      <Toaster position="bottom-right" richColors closeButton />
    </FeedbackContext.Provider>
  )
}

export const useFeedback = (): FeedbackContextValue => {
  const context = useContext(FeedbackContext)
  if (!context)
    throw new Error('useFeedback must be used within FeedbackProvider')
  return context
}
