import {
  type NotificationChannel,
  type NotificationEvent,
  type NotificationSettings,
  SECRET_MASK,
} from '@shared/types'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ExternalLink,
  Mail,
  Send,
  Shuffle,
  Smartphone,
  Webhook,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { SAVE_BAR_SPACE, SaveBar } from '../components/SaveBar'
import { Select } from '../components/Select'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
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

// Label above its input
const fieldClass = 'flex flex-col gap-2'
const hintClass = 'text-xs text-muted-foreground'

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
    language: getLocale(),
  }
}

function NotificationsPage() {
  const { data, isLoading, error } = useNotificationSettings()

  return (
    <PageLayout
      title={m.notifications_title()}
      description={<p className="max-w-3xl">{m.notifications_intro()}</p>}
    >
      {isLoading && (
        <p className="text-sm text-muted-foreground">{m.common_loading()}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
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

  const setEvent = (event: NotificationEvent, enabled: boolean) =>
    setSettings((s) => ({ ...s, events: { ...s.events, [event]: enabled } }))

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
      variant="outline"
      size="sm"
      onClick={() => handleTest(channel)}
      disabled={testing !== null}
    >
      <Send />
      {testing === channel
        ? m.notifications_test_sending()
        : m.notifications_test()}
    </Button>
  )

  const { email, ntfy, webhook } = settings

  return (
    <div className={`flex flex-col gap-6 ${SAVE_BAR_SPACE}`}>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {m.notifications_channels()}
          </h2>

          <ChannelCard
            icon={<Smartphone />}
            iconClass="bg-green-50 text-green-700"
            title="ntfy"
            badge={m.notifications_recommended()}
            description={m.notifications_ntfy_desc()}
            enabled={ntfy.enabled}
            onToggle={(enabled) => update('ntfy', { enabled })}
            actions={
              <>
                {testButton('ntfy')}
                {ntfy.topic && ntfy.server && (
                  <Button variant="ghost" size="sm" asChild>
                    <a
                      href={`${ntfy.server.replace(/\/+$/, '')}/${encodeURIComponent(ntfy.topic)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      {m.notifications_ntfy_open()}
                    </a>
                  </Button>
                )}
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldClass}>
                <Label htmlFor="ntfy-server">
                  {m.notifications_ntfy_server()}
                </Label>
                <Input
                  id="ntfy-server"
                  type="url"
                  value={ntfy.server}
                  onChange={(e) => update('ntfy', { server: e.target.value })}
                  className="bg-background font-mono"
                />
              </div>
              <div className={fieldClass}>
                <Label htmlFor="ntfy-topic">
                  {m.notifications_ntfy_topic()}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="ntfy-topic"
                    type="text"
                    value={ntfy.topic}
                    onChange={(e) => update('ntfy', { topic: e.target.value })}
                    className="bg-background font-mono"
                  />
                  <Button
                    variant="outline"
                    onClick={() => update('ntfy', { topic: randomTopic() })}
                  >
                    <Shuffle />
                    {m.notifications_ntfy_random()}
                  </Button>
                </div>
              </div>
              <div className={`${fieldClass} sm:col-span-2`}>
                <Label htmlFor="ntfy-token">
                  {m.notifications_ntfy_token()}
                </Label>
                <SecretInput
                  id="ntfy-token"
                  value={ntfy.token}
                  onChange={(token) => update('ntfy', { token })}
                />
              </div>
            </div>
            <p className={hintClass}>{m.notifications_ntfy_hint()}</p>
          </ChannelCard>

          <ChannelCard
            icon={<Mail />}
            iconClass="bg-blue-50 text-blue-700"
            title={m.notifications_email()}
            description={m.notifications_email_desc()}
            enabled={email.enabled}
            onToggle={(enabled) => update('email', { enabled })}
            actions={testButton('email')}
          >
            <div className="grid gap-4 sm:grid-cols-6">
              <div className={`${fieldClass} sm:col-span-3`}>
                <Label htmlFor="smtp-host">
                  {m.notifications_email_host()}
                </Label>
                <Input
                  id="smtp-host"
                  type="text"
                  value={email.host}
                  onChange={(e) => update('email', { host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="bg-background"
                />
              </div>
              <div className={`${fieldClass} sm:col-span-2`}>
                <Label htmlFor="smtp-security">
                  {m.notifications_email_security()}
                </Label>
                <Select
                  id="smtp-security"
                  size="sm"
                  value={email.security}
                  onChange={(security) => {
                    // Follow the port while it is still the default of the previous choice
                    const port =
                      email.port === SMTP_PORTS[email.security]
                        ? SMTP_PORTS[security]
                        : email.port
                    update('email', { security, port })
                  }}
                  options={[
                    { value: 'starttls', label: 'STARTTLS' },
                    { value: 'tls', label: 'SSL/TLS' },
                    {
                      value: 'none',
                      label: m.notifications_email_security_none(),
                    },
                  ]}
                />
              </div>
              <div className={fieldClass}>
                <Label htmlFor="smtp-port">
                  {m.notifications_email_port()}
                </Label>
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={email.port}
                  onChange={(e) =>
                    update('email', { port: Number(e.target.value) })
                  }
                  className="bg-background tabular-nums"
                />
              </div>
              <div className={`${fieldClass} sm:col-span-3`}>
                <Label htmlFor="smtp-user">
                  {m.notifications_email_username()}
                </Label>
                <Input
                  id="smtp-user"
                  type="text"
                  autoComplete="off"
                  value={email.username}
                  onChange={(e) =>
                    update('email', { username: e.target.value })
                  }
                  className="bg-background"
                />
              </div>
              <div className={`${fieldClass} sm:col-span-3`}>
                <Label htmlFor="smtp-password">
                  {m.notifications_email_password()}
                </Label>
                <SecretInput
                  id="smtp-password"
                  value={email.password}
                  onChange={(password) => update('email', { password })}
                />
              </div>
              <div className={`${fieldClass} sm:col-span-3`}>
                <Label htmlFor="smtp-from">
                  {m.notifications_email_from()}
                </Label>
                <Input
                  id="smtp-from"
                  type="text"
                  value={email.from}
                  onChange={(e) => update('email', { from: e.target.value })}
                  placeholder={email.username || 'snapraid@example.com'}
                  className="bg-background"
                />
              </div>
              <div className={`${fieldClass} sm:col-span-3`}>
                <Label htmlFor="smtp-to">{m.notifications_email_to()}</Label>
                <Input
                  id="smtp-to"
                  type="text"
                  value={email.to}
                  onChange={(e) => update('email', { to: e.target.value })}
                  placeholder="me@example.com"
                  className="bg-background"
                />
              </div>
            </div>
            <p className={hintClass}>{m.notifications_email_hint()}</p>
          </ChannelCard>

          <ChannelCard
            icon={<Webhook />}
            iconClass="bg-purple-50 text-purple-700"
            title="Webhook"
            description={m.notifications_webhook_desc()}
            enabled={webhook.enabled}
            onToggle={(enabled) => update('webhook', { enabled })}
            actions={testButton('webhook')}
          >
            <div className={fieldClass}>
              <Label htmlFor="webhook-url">URL</Label>
              <Input
                id="webhook-url"
                type="url"
                value={webhook.url}
                onChange={(e) => update('webhook', { url: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
                className="bg-background font-mono"
              />
            </div>
            <p className={hintClass}>{m.notifications_webhook_hint()}</p>
          </ChannelCard>

          <Card className="mt-3 gap-4 p-5">
            <h2 className="text-base font-semibold">
              {m.notifications_general()}
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className={fieldClass}>
                <Label htmlFor="notify-language">
                  {m.notifications_language()}
                </Label>
                <Select
                  id="notify-language"
                  size="sm"
                  value={settings.language}
                  onChange={(language) =>
                    setSettings((s) => ({ ...s, language }))
                  }
                  options={[
                    { value: 'de', label: 'Deutsch' },
                    { value: 'en', label: 'English' },
                    { value: 'it', label: 'Italiano' },
                  ]}
                />
              </div>
              <div className={`${fieldClass} sm:col-span-2`}>
                <Label htmlFor="notify-ui-url">
                  {m.notifications_ui_url()}
                </Label>
                <Input
                  id="notify-ui-url"
                  type="url"
                  value={settings.uiUrl}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, uiUrl: e.target.value }))
                  }
                  placeholder="http://nas:3000"
                  className="font-mono"
                />
                <p className={hintClass}>{m.notifications_ui_url_hint()}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="min-w-0 flex-[1_1_360px] gap-0 p-5">
          <h2 className="text-base font-semibold">
            {m.notifications_events()}
          </h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            {m.notifications_events_desc()}
          </p>
          {EVENTS.map((event) => (
            <EventRow
              key={event.id}
              id={`event-${event.id}`}
              label={event.label()}
              description={event.description()}
              checked={settings.events[event.id]}
              onCheckedChange={(checked) => setEvent(event.id, checked)}
            >
              {event.id === 'smart_warning' &&
                settings.events.smart_warning && (
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Label htmlFor="smart-threshold" className="font-normal">
                        {m.notifications_smart_threshold()}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
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
                          className="h-8 w-20 bg-background font-mono tabular-nums"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                    <p className={hintClass}>
                      {m.notifications_smart_schedule_hint()}{' '}
                      <Link
                        to="/schedules"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {m.schedules()}
                      </Link>
                    </p>
                  </div>
                )}
            </EventRow>
          ))}
          <EventRow
            id="event-manual-jobs"
            label={m.notifications_manual_jobs()}
            description={m.notifications_manual_jobs_desc()}
            checked={settings.includeManualJobs}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, includeManualJobs: checked }))
            }
          />
        </Card>
      </div>

      <SaveBar hint={dirty && m.notifications_unsaved()}>
        <Button
          variant="outline"
          onClick={() => setSettings(saved)}
          disabled={!dirty || save.isPending}
        >
          {m.common_cancel()}
        </Button>
        <Button onClick={handleSave} disabled={!dirty || save.isPending}>
          {m.common_save()}
        </Button>
      </SaveBar>
    </div>
  )
}

interface ChannelCardProps {
  icon: ReactNode
  iconClass: string
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
  iconClass,
  title,
  badge,
  description,
  enabled,
  onToggle,
  actions,
  children,
}: ChannelCardProps) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-4 px-5 py-4">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5 ${iconClass}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {badge && <Badge variant="secondary">{badge}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`${title}: ${m.notifications_enabled()}`}
        />
      </div>
      {enabled && (
        <div className="ui-fade-in flex flex-col gap-4 border-t bg-muted/50 px-5 py-4">
          {children}
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
    </Card>
  )
}

function EventRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t py-3 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor={id} className="cursor-pointer leading-snug">
            {label}
          </Label>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5"
        />
      </div>
      {children}
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
    <Input
      id={id}
      type="password"
      autoComplete="new-password"
      value={value}
      onFocus={(e) => value === SECRET_MASK && e.target.select()}
      onChange={(e) => onChange(e.target.value)}
      placeholder={m.notifications_secret_placeholder()}
      className="bg-background"
    />
  )
}
