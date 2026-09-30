import {
  type NotificationChannel,
  type NotificationEvent,
  type NotificationSettings,
  SECRET_MASK,
} from '@shared/types'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Mail, Send, Smartphone, Webhook } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '../components/Button'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '../hooks/queries'
import { notificationsApi } from '../lib/api/notifications'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/notifications')({
  component: NotificationsPage,
})

const EVENTS: Array<{
  id: NotificationEvent
  label: () => string
  description: () => string
}> = [
  {
    id: 'job_failed',
    label: m.notifications_event_job_failed,
    description: m.notifications_event_job_failed_desc,
  },
  {
    id: 'data_errors',
    label: m.notifications_event_data_errors,
    description: m.notifications_event_data_errors_desc,
  },
  {
    id: 'schedule_skipped',
    label: m.notifications_event_schedule_skipped,
    description: m.notifications_event_schedule_skipped_desc,
  },
  {
    id: 'smart_warning',
    label: m.notifications_event_smart_warning,
    description: m.notifications_event_smart_warning_desc,
  },
  {
    id: 'job_succeeded',
    label: m.notifications_event_job_succeeded,
    description: m.notifications_event_job_succeeded_desc,
  },
]

const SMTP_PORTS: Record<NotificationSettings['email']['security'], number> = {
  starttls: 587,
  tls: 465,
  none: 25,
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
const checkboxClass =
  'w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'

const randomTopic = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const suffix = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
  return `snapraid-${suffix}`
}

// Settings never saved start with the address and language the UI runs with
const withFreshDefaults = (
  settings: NotificationSettings,
): NotificationSettings => {
  const fresh =
    !settings.uiUrl &&
    !settings.email.enabled &&
    !settings.ntfy.enabled &&
    !settings.webhook.enabled
  if (!fresh || typeof window === 'undefined') return settings
  return {
    ...settings,
    uiUrl: window.location.origin,
    language: getLocale() === 'de' ? 'de' : 'en',
  }
}

function NotificationsPage() {
  const { data, isLoading, error } = useNotificationSettings()

  return (
    <PageLayout title={m.notifications_title()}>
      <p className="mb-6 max-w-3xl text-sm text-gray-600">
        {m.notifications_intro()}
      </p>
      {isLoading && <p className="text-gray-600">{m.common_loading()}</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage(error)}
        </div>
      )}
      {data && <NotificationForm initial={withFreshDefaults(data)} />}
    </PageLayout>
  )
}

function NotificationForm({ initial }: { initial: NotificationSettings }) {
  const { toast } = useFeedback()
  const save = useSaveNotificationSettings()
  const [settings, setSettings] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [testing, setTesting] = useState<NotificationChannel | null>(null)

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)

  const update = <K extends 'email' | 'ntfy' | 'webhook'>(
    channel: K,
    changes: Partial<NotificationSettings[K]>,
  ) => setSettings((s) => ({ ...s, [channel]: { ...s[channel], ...changes } }))

  const handleSave = async () => {
    try {
      const result = await save.mutateAsync(settings)
      setSettings(result)
      setSaved(result)
      toast.success(m.notifications_saved())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const handleTest = async (channel: NotificationChannel) => {
    setTesting(channel)
    try {
      // Test the channel as entered, even while it is still switched off
      const [result] = await notificationsApi.test(
        { ...settings, [channel]: { ...settings[channel], enabled: true } },
        channel,
      )
      if (result.ok) toast.success(m.notifications_test_sent())
      else
        toast.error(m.notifications_test_failed({ error: result.error ?? '' }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTesting(null)
    }
  }

  const testButton = (channel: NotificationChannel) => (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => handleTest(channel)}
      disabled={testing !== null}
    >
      <Send size={14} />
      {testing === channel
        ? m.notifications_test_sending()
        : m.notifications_test()}
    </Button>
  )

  const { email, ntfy, webhook } = settings

  return (
    <div className="space-y-6 pb-24">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {m.notifications_channels()}
        </h2>

        <ChannelCard
          icon={<Smartphone size={20} />}
          title="ntfy"
          badge={m.notifications_recommended()}
          description={m.notifications_ntfy_desc()}
          enabled={ntfy.enabled}
          onToggle={(enabled) => update('ntfy', { enabled })}
          actions={testButton('ntfy')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ntfy-server" className={labelClass}>
                {m.notifications_ntfy_server()}
              </label>
              <input
                id="ntfy-server"
                type="url"
                value={ntfy.server}
                onChange={(e) => update('ntfy', { server: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ntfy-topic" className={labelClass}>
                {m.notifications_ntfy_topic()}
              </label>
              <div className="flex gap-2">
                <input
                  id="ntfy-topic"
                  type="text"
                  value={ntfy.topic}
                  onChange={(e) => update('ntfy', { topic: e.target.value })}
                  className={`${inputClass} font-mono`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => update('ntfy', { topic: randomTopic() })}
                  className="shrink-0"
                >
                  {m.notifications_ntfy_random()}
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ntfy-token" className={labelClass}>
                {m.notifications_ntfy_token()}
              </label>
              <SecretInput
                id="ntfy-token"
                value={ntfy.token}
                onChange={(token) => update('ntfy', { token })}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {m.notifications_ntfy_hint()}
            {ntfy.topic && ntfy.server && (
              <>
                {' '}
                <a
                  href={`${ntfy.server.replace(/\/+$/, '')}/${encodeURIComponent(ntfy.topic)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {m.notifications_ntfy_open()}
                </a>
              </>
            )}
          </p>
        </ChannelCard>

        <ChannelCard
          icon={<Mail size={20} />}
          title={m.notifications_email()}
          description={m.notifications_email_desc()}
          enabled={email.enabled}
          onToggle={(enabled) => update('email', { enabled })}
          actions={testButton('email')}
        >
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="smtp-host" className={labelClass}>
                {m.notifications_email_host()}
              </label>
              <input
                id="smtp-host"
                type="text"
                value={email.host}
                onChange={(e) => update('email', { host: e.target.value })}
                placeholder="smtp.gmail.com"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="smtp-security" className={labelClass}>
                {m.notifications_email_security()}
              </label>
              <select
                id="smtp-security"
                value={email.security}
                onChange={(e) => {
                  const security = e.target
                    .value as NotificationSettings['email']['security']
                  // Follow the port while it is still the default of the previous choice
                  const port =
                    email.port === SMTP_PORTS[email.security]
                      ? SMTP_PORTS[security]
                      : email.port
                  update('email', { security, port })
                }}
                className={inputClass}
              >
                <option value="starttls">STARTTLS</option>
                <option value="tls">SSL/TLS</option>
                <option value="none">
                  {m.notifications_email_security_none()}
                </option>
              </select>
            </div>
            <div>
              <label htmlFor="smtp-port" className={labelClass}>
                {m.notifications_email_port()}
              </label>
              <input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={email.port}
                onChange={(e) =>
                  update('email', { port: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="smtp-user" className={labelClass}>
                {m.notifications_email_username()}
              </label>
              <input
                id="smtp-user"
                type="text"
                autoComplete="off"
                value={email.username}
                onChange={(e) => update('email', { username: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="smtp-password" className={labelClass}>
                {m.notifications_email_password()}
              </label>
              <SecretInput
                id="smtp-password"
                value={email.password}
                onChange={(password) => update('email', { password })}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="smtp-from" className={labelClass}>
                {m.notifications_email_from()}
              </label>
              <input
                id="smtp-from"
                type="text"
                value={email.from}
                onChange={(e) => update('email', { from: e.target.value })}
                placeholder={email.username || 'snapraid@example.com'}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="smtp-to" className={labelClass}>
                {m.notifications_email_to()}
              </label>
              <input
                id="smtp-to"
                type="text"
                value={email.to}
                onChange={(e) => update('email', { to: e.target.value })}
                placeholder="me@example.com"
                className={inputClass}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {m.notifications_email_hint()}
          </p>
        </ChannelCard>

        <ChannelCard
          icon={<Webhook size={20} />}
          title="Webhook"
          description={m.notifications_webhook_desc()}
          enabled={webhook.enabled}
          onToggle={(enabled) => update('webhook', { enabled })}
          actions={testButton('webhook')}
        >
          <label htmlFor="webhook-url" className={labelClass}>
            URL
          </label>
          <input
            id="webhook-url"
            type="url"
            value={webhook.url}
            onChange={(e) => update('webhook', { url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
            className={`${inputClass} font-mono`}
          />
          <p className="mt-3 text-xs text-gray-500">
            {m.notifications_webhook_hint()}
          </p>
        </ChannelCard>
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          {m.notifications_events()}
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          {m.notifications_events_desc()}
        </p>
        <div className="space-y-3">
          {EVENTS.map((event) => (
            <div key={event.id}>
              <label className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={settings.events[event.id]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      events: { ...s.events, [event.id]: e.target.checked },
                    }))
                  }
                  className={`${checkboxClass} mt-0.5`}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">
                    {event.label()}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {event.description()}
                  </span>
                </span>
              </label>
              {event.id === 'smart_warning' &&
                settings.events.smart_warning && (
                  <div className="mt-2 ml-7 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <label htmlFor="smart-threshold">
                        {m.notifications_smart_threshold()}
                      </label>
                      <input
                        id="smart-threshold"
                        type="number"
                        min={1}
                        max={100}
                        value={settings.smartFailureThreshold}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            smartFailureThreshold: Number(e.target.value),
                          }))
                        }
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span>%</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {m.notifications_smart_schedule_hint()}{' '}
                      <Link
                        to="/schedules"
                        className="text-blue-600 hover:underline"
                      >
                        {m.schedules()}
                      </Link>
                    </p>
                  </div>
                )}
            </div>
          ))}
          <label className="flex cursor-pointer gap-3 border-t border-gray-100 pt-3">
            <input
              type="checkbox"
              checked={settings.includeManualJobs}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  includeManualJobs: e.target.checked,
                }))
              }
              className={`${checkboxClass} mt-0.5`}
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">
                {m.notifications_manual_jobs()}
              </span>
              <span className="block text-xs text-gray-500">
                {m.notifications_manual_jobs_desc()}
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {m.notifications_general()}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="notify-language" className={labelClass}>
              {m.notifications_language()}
            </label>
            <select
              id="notify-language"
              value={settings.language}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  language: e.target.value as NotificationSettings['language'],
                }))
              }
              className={inputClass}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notify-ui-url" className={labelClass}>
              {m.notifications_ui_url()}
            </label>
            <input
              id="notify-ui-url"
              type="url"
              value={settings.uiUrl}
              onChange={(e) =>
                setSettings((s) => ({ ...s, uiUrl: e.target.value }))
              }
              placeholder="http://nas:3000"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              {m.notifications_ui_url_hint()}
            </p>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {dirty && (
            <span className="text-sm text-gray-600">
              {m.notifications_unsaved()}
            </span>
          )}
          <Button
            variant="secondary"
            onClick={() => setSettings(saved)}
            disabled={!dirty || save.isPending}
          >
            {m.common_cancel()}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || save.isPending}>
            {m.common_save()}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ChannelCardProps {
  icon: ReactNode
  title: string
  badge?: string
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  actions: ReactNode
  children: ReactNode
}

function ChannelCard({
  icon,
  title,
  badge,
  description,
  enabled,
  onToggle,
  actions,
  children,
}: ChannelCardProps) {
  return (
    <div
      className={`rounded-lg bg-white shadow ${enabled ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-4 p-5">
        <span
          className={`mt-0.5 ${enabled ? 'text-blue-600' : 'text-gray-400'}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">
            {title}
            {badge && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {badge}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-gray-600">{description}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className={checkboxClass}
          />
          {m.notifications_enabled()}
        </label>
      </div>
      {enabled && (
        <div className="border-t border-gray-100 p-5">
          {children}
          <div className="mt-4 flex justify-end">{actions}</div>
        </div>
      )}
    </div>
  )
}

// A stored secret arrives masked; focusing selects it so typing replaces it
function SecretInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      id={id}
      type="password"
      autoComplete="new-password"
      value={value}
      onFocus={(e) => value === SECRET_MASK && e.target.select()}
      onChange={(e) => onChange(e.target.value)}
      placeholder={m.notifications_secret_placeholder()}
      className={inputClass}
    />
  )
}
