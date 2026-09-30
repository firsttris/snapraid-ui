import type { AuthSession } from '@shared/types'
import {
  AlertCircle,
  Eye,
  EyeOff,
  HardDrive,
  Languages,
  Loader2,
  Lock,
  LogIn,
  User,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { login } from '../lib/api/auth'
import * as m from '../paraglide/messages'
import { getLocale, setLocale } from '../paraglide/runtime'

// Columns of the disk array in the background, the last two are parity
const DISK_COUNT = 6
const PARITY_COUNT = 2

type LoginError =
  | { kind: 'invalid' }
  | { kind: 'server' }
  | { kind: 'locked'; until: number }

const formatCountdown = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// A stylised array: data disks fill up, parity stripes sweep across them
const DiskArray = () => (
  <div className="flex items-end justify-center gap-2" aria-hidden="true">
    {Array.from({ length: DISK_COUNT }, (_, i) => {
      const isParity = i >= DISK_COUNT - PARITY_COUNT
      return (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          key={i}
          className={`relative h-14 w-6 overflow-hidden rounded-md border ${
            isParity
              ? 'border-cyan-400/40 bg-cyan-400/10'
              : 'border-white/15 bg-white/5'
          }`}
        >
          <div
            className={`login-disk-fill absolute inset-x-0 bottom-0 ${
              isParity ? 'bg-cyan-400/60' : 'bg-white/25'
            }`}
            style={{ animationDelay: `${i * 0.35}s` }}
          />
          <div
            className="login-disk-led absolute top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        </div>
      )
    })}
  </div>
)

export const LoginPage = ({
  onLogin,
}: {
  onLogin: (session: AuthSession) => void
}) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  // Remounts the error box, so the shake plays again on every failed attempt
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const currentLocale = getLocale()

  const lockedSeconds =
    error?.kind === 'locked'
      ? Math.max(0, Math.ceil((error.until - now) / 1000))
      : 0

  useEffect(() => {
    if (error?.kind !== 'locked') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [error])

  useEffect(() => {
    if (error?.kind === 'locked' && lockedSeconds === 0) setError(null)
  }, [error, lockedSeconds])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || lockedSeconds > 0) return
    setSubmitting(true)
    try {
      const result = await login(username, password)
      if (result.ok) {
        onLogin(result.session)
        return
      }
      setPassword('')
      setError(
        result.reason === 'locked'
          ? { kind: 'locked', until: Date.now() + result.retryAfter * 1000 }
          : { kind: 'invalid' },
      )
      setNow(Date.now())
    } catch {
      setError({ kind: 'server' })
    } finally {
      setAttempt((prev) => prev + 1)
      setSubmitting(false)
    }
  }

  const errorMessage =
    error?.kind === 'invalid'
      ? m.login_invalid()
      : error?.kind === 'server'
        ? m.login_server_error()
        : error?.kind === 'locked'
          ? m.login_locked({ time: formatCountdown(lockedSeconds) })
          : null

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-4 pl-11 text-white placeholder-gray-500 outline-none transition focus:border-cyan-400/60 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/15'

  return (
    <main className="theme-fixed relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 px-4 py-12">
      {/* Background: grid and soft glows */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div className="login-glow pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
      <div
        className="login-glow pointer-events-none absolute -right-32 -bottom-40 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl"
        style={{ animationDelay: '-4s' }}
      />

      <button
        type="button"
        onClick={() => setLocale(currentLocale === 'en' ? 'de' : 'en')}
        className="absolute top-4 right-4 flex items-center gap-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Switch language"
      >
        <Languages size={18} />
        <span className="text-sm font-medium">
          {currentLocale.toUpperCase()}
        </span>
      </button>

      <div className="login-card relative w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-gray-900/70 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-2xl bg-cyan-400/30 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-indigo-500/20">
                <HardDrive size={30} className="text-cyan-300" />
              </div>
            </div>
            <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-cyan-400 uppercase">
              {m.app_title()}
            </p>
            <h1 className="text-2xl font-bold text-white">{m.login_title()}</h1>
            <p className="mt-1 text-sm text-gray-400">{m.login_subtitle()}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <label className="block">
              <span className="sr-only">{m.login_username()}</span>
              <div className="relative">
                <User
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  // biome-ignore lint/a11y/noAutofocus: the login form is the only thing on the page
                  autoFocus
                  placeholder={m.login_username()}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                />
              </div>
            </label>

            <label className="block">
              <span className="sr-only">{m.login_password()}</span>
              <div className="relative">
                <Lock
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-500"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder={m.login_password()}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-200"
                  aria-label={
                    showPassword
                      ? m.login_hide_password()
                      : m.login_show_password()
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {errorMessage && (
              <div
                key={attempt}
                role="alert"
                className="login-shake flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
              >
                <AlertCircle size={18} className="mt-px shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting || lockedSeconds > 0 || !username || !password
              }
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 py-3 font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:shadow-cyan-500/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="login-sheen absolute inset-0" />
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {m.login_submitting()}
                </>
              ) : (
                <>
                  <LogIn
                    size={18}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                  {m.login_submit()}
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <DiskArray />
          <p className="text-xs text-gray-500">{m.login_footer()}</p>
        </div>
      </div>
    </main>
  )
}
