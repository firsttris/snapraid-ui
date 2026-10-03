import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useDialogKeys } from '../hooks/useDialogKeys'
import { localizeServer } from '../lib/i18n'
import * as m from '../paraglide/messages'

// How long a toast stays visible, errors stay longer so they can be read
const TOAST_DURATION_MS = 5000
const ERROR_TOAST_DURATION_MS = 10000

type ToastKind = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
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

const TOAST_STYLES: Record<ToastKind, { box: string; icon: ReactNode }> = {
  success: {
    box: 'border-green-200 bg-green-50 text-green-900',
    icon: <CheckCircle2 size={18} className="text-green-600" />,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: <XCircle size={18} className="text-red-600" />,
  },
  info: {
    box: 'border-blue-200 bg-blue-50 text-blue-900',
    icon: <Info size={18} className="text-blue-600" />,
  },
}

/**
 * Error message of an unknown thrown value
 */
export const errorMessage = (error: unknown): string =>
  localizeServer(error instanceof Error ? error.message : String(error))

const ConfirmDialog = ({
  pending,
  onAnswer,
}: {
  pending: PendingConfirm
  onAnswer: (confirmed: boolean) => void
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useDialogKeys(dialogRef, () => onAnswer(false))

  // After useDialogKeys focused the dialog
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md rounded-lg bg-white shadow-xl outline-none"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {pending.title ?? m.confirm_title()}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-600">
            {pending.message}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t p-4">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            {m.confirm_cancel()}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onAnswer(true)}
            className={`rounded px-4 py-2 text-white ${
              pending.danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {pending.confirmLabel ?? m.confirm_ok()}
          </button>
        </div>
      </div>
    </div>
  )
}

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  )
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string, action?: ToastAction) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, kind, message, action }])
      setTimeout(
        () => dismiss(id),
        kind === 'error' ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS,
      )
    },
    [dismiss],
  )

  const [value] = useState<FeedbackContextValue>(() => ({
    confirm: (options) =>
      new Promise<boolean>((resolve) =>
        setPendingConfirm({ ...options, resolve }),
      ),
    toast: {
      success: (message, action) => show('success', message, action),
      error: (message, action) => show('error', message, action),
      info: (message, action) => show('info', message, action),
    },
  }))

  const answer = useCallback(
    (confirmed: boolean) => {
      pendingConfirm?.resolve(confirmed)
      setPendingConfirm(null)
    },
    [pendingConfirm],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {pendingConfirm && (
        <ConfirmDialog pending={pendingConfirm} onAnswer={answer} />
      )}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg ${TOAST_STYLES[toast.kind].box}`}
          >
            <span className="mt-0.5 shrink-0">
              {TOAST_STYLES[toast.kind].icon}
            </span>
            <span className="flex-1 break-words">
              {toast.message}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id)
                    toast.action?.onClick()
                  }}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  {toast.action.label}
                </button>
              )}
            </span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
              aria-label={m.toast_dismiss()}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

export const useFeedback = (): FeedbackContextValue => {
  const context = useContext(FeedbackContext)
  if (!context)
    throw new Error('useFeedback must be used within FeedbackProvider')
  return context
}
