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
  Timer,
  User,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { login } from '../lib/api/auth'
import { cn } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale, locales, setLocale } from '../paraglide/runtime'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

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

  // The login is dark in both themes, so it sets its colors instead of using the theme tokens
  const inputClass =
    'h-11 border-white/10 bg-white/5 pl-10 text-white shadow-none selection:bg-cyan-400/30 selection:text-white placeholder:text-gray-500 focus-visible:border-cyan-400/60 focus-visible:bg-white/10 focus-visible:ring-cyan-400/20 dark:bg-white/5'
  const iconClass =
    'pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-500'

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

      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          setLocale(
            locales[(locales.indexOf(currentLocale) + 1) % locales.length],
          )
        }
        className="absolute top-4 right-4 text-gray-400 hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
        aria-label={m.common_switch_language()}
      >
        <Languages />
        {currentLocale.toUpperCase()}
      </Button>

      <div className="login-card relative w-full max-w-sm">
        <Card className="gap-8 rounded-2xl border-white/10 bg-gray-900/70 py-8 text-white shadow-2xl shadow-black/50 backdrop-blur-xl">
          <CardHeader className="flex flex-col items-center gap-0 px-8 text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-2xl bg-cyan-400/30 blur-xl" />
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-indigo-500/20">
                <HardDrive className="size-7 text-cyan-300" />
              </div>
            </div>
            <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-cyan-400 uppercase">
              {m.app_title()}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {m.login_title()}
            </h1>
            <p className="mt-1 text-sm text-gray-400">{m.login_subtitle()}</p>
          </CardHeader>

          <CardContent className="px-8">
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-username" className="text-gray-300">
                  {m.login_username()}
                </Label>
                <div className="relative">
                  <User className={iconClass} />
                  <Input
                    id="login-username"
                    type="text"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password" className="text-gray-300">
                  {m.login_password()}
                </Label>
                <div className="relative">
                  <Lock className={iconClass} />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(inputClass, 'pr-11')}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 text-gray-500 hover:bg-white/10 hover:text-gray-200 dark:hover:bg-white/10"
                    aria-label={
                      showPassword
                        ? m.login_hide_password()
                        : m.login_show_password()
                    }
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>

              {errorMessage && (
                <Alert
                  key={attempt}
                  className={cn(
                    'login-shake',
                    error?.kind === 'locked'
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-red-500/30 bg-red-500/10 text-red-300',
                  )}
                >
                  {error?.kind === 'locked' ? <Timer /> : <AlertCircle />}
                  <AlertDescription className="text-current tabular-nums">
                    {errorMessage}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={
                  submitting || lockedSeconds > 0 || !username || !password
                }
                className="group relative mt-2 h-11 overflow-hidden bg-gradient-to-r from-cyan-500 to-indigo-500 font-semibold text-white shadow-lg shadow-cyan-500/20 hover:bg-transparent hover:shadow-cyan-500/40 focus-visible:ring-cyan-400/40"
              >
                <span className="login-sheen absolute inset-0" />
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {m.login_submitting()}
                  </>
                ) : (
                  <>
                    <LogIn className="transition-transform group-hover:translate-x-0.5" />
                    {m.login_submit()}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-col items-center gap-3">
          <DiskArray />
          <p className="text-xs text-gray-500">{m.login_footer()}</p>
        </div>
      </div>
    </main>
  )
}
