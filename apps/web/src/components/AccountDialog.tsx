import type { PasskeyInfo } from '@shared/types'
import { Check, KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  changePassword,
  createPasskey,
  deletePasskey,
  listPasskeys,
  passkeyCancelled,
  passkeysSupported,
  renamePasskey,
} from '../lib/api/auth'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { errorMessage, useFeedback } from './Feedback'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

// The backend's minimum (MIN_PASSWORD_LENGTH in backend/src/auth.ts)
const MIN_PASSWORD_LENGTH = 12
const MAX_NAME_LENGTH = 64

const formatTimestamp = (ms: number) =>
  new Date(ms).toLocaleString(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const Section = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
)

const PasswordForm = () => {
  const { toast } = useFeedback()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(m.account_password_too_short({ min: MIN_PASSWORD_LENGTH }))
      return
    }
    if (next !== repeat) {
      setError(m.account_password_mismatch())
      return
    }
    setBusy(true)
    setError('')
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      toast.success(m.account_password_changed())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={m.account_password_title()}>
      <p className="text-sm text-muted-foreground">
        {m.account_password_hint({ min: MIN_PASSWORD_LENGTH })}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {/* For the password manager: whose password this is */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          hidden
          readOnly
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-current">
            {m.account_password_current()}
          </Label>
          <Input
            id="account-current"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-new">{m.account_password_new()}</Label>
            <Input
              id="account-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-repeat">
              {m.account_password_repeat()}
            </Label>
            <Input
              id="account-repeat"
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          className="self-start"
          disabled={busy || !current || !next || !repeat}
        >
          {m.account_password_submit()}
        </Button>
      </form>
    </Section>
  )
}

const PasskeyRow = ({
  passkey,
  onChanged,
}: {
  passkey: PasskeyInfo
  onChanged: () => Promise<void>
}) => {
  const { confirm, toast } = useFeedback()
  const [name, setName] = useState<string | null>(null)

  const rename = async (event: FormEvent) => {
    event.preventDefault()
    if (name === null) return
    try {
      await renamePasskey(passkey.id, name)
      setName(null)
      await onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    const confirmed = await confirm({
      title: m.account_passkey_delete_title(),
      message: m.account_passkey_delete_confirm({ name: passkey.name }),
      confirmLabel: m.account_passkey_delete(),
      danger: true,
    })
    if (!confirmed) return
    try {
      await deletePasskey(passkey.id)
      toast.success(m.account_passkey_deleted())
      await onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" />
      {name === null ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{passkey.name}</span>
            <span className="text-xs text-muted-foreground">
              {m.account_passkey_details({
                host: passkey.rpId,
                created: formatTimestamp(passkey.createdAt),
                used: passkey.lastUsedAt
                  ? formatTimestamp(passkey.lastUsedAt)
                  : m.account_passkey_never_used(),
              })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.account_passkey_rename()}
            title={m.account_passkey_rename()}
            onClick={() => setName(passkey.name)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.account_passkey_delete()}
            title={m.account_passkey_delete()}
            onClick={remove}
          >
            <Trash2 />
          </Button>
        </>
      ) : (
        <form onSubmit={rename} className="flex flex-1 items-center gap-2">
          <Input
            aria-label={m.account_passkey_name()}
            required
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label={m.common_save()}
            title={m.common_save()}
          >
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.common_cancel()}
            title={m.common_cancel()}
            onClick={() => setName(null)}
          >
            <X />
          </Button>
        </form>
      )}
    </li>
  )
}

const Passkeys = () => {
  const { toast } = useFeedback()
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)

  const load = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys())
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    setSupported(passkeysSupported())
    load()
  }, [load])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createPasskey(name, password)
      toast.success(m.account_passkey_added())
      setAdding(false)
      setName('')
      setPassword('')
      await load()
    } catch (err) {
      setError(passkeyCancelled(err) ? '' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={m.account_passkeys_title()}>
      <p className="text-sm text-muted-foreground">
        {m.account_passkeys_hint()}
      </p>
      {!supported && (
        <Alert variant="warning">
          <AlertDescription>
            {m.account_passkeys_unsupported()}
          </AlertDescription>
        </Alert>
      )}
      {passkeys?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {m.account_passkeys_empty()}
        </p>
      )}
      {!!passkeys?.length && (
        <ul className="flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <PasskeyRow key={passkey.id} passkey={passkey} onChanged={load} />
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="flex flex-col gap-3">
          <input
            type="text"
            name="username"
            autoComplete="username"
            hidden
            readOnly
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="passkey-name">{m.account_passkey_name()}</Label>
              <Input
                id="passkey-name"
                required
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                placeholder={m.account_passkey_name_placeholder()}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="passkey-password">
                {m.account_passkey_password()}
              </Label>
              <Input
                id="passkey-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !name.trim() || !password}>
              {m.account_passkey_create()}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setAdding(false)
                setError('')
              }}
            >
              {m.common_cancel()}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="outline"
            className="self-start"
            disabled={!supported}
            onClick={() => {
              setError('')
              setAdding(true)
            }}
          >
            <Plus />
            {m.account_passkey_add()}
          </Button>
        </>
      )}
    </Section>
  )
}

/**
 * The sign-in of the one user: change the password, add and remove passkeys
 */
export const AccountDialog = ({ onClose }: { onClose: () => void }) => (
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{m.account_title()}</DialogTitle>
        <DialogDescription>{m.account_description()}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-8">
        <PasswordForm />
        <Passkeys />
      </div>
    </DialogContent>
  </Dialog>
)
