import type {
  DaemonCheck,
  DaemonTarget,
  DaemonWarning,
  DockerContainer,
  EngineSettings,
  MaintenanceSettings,
  SnapRaidCommand,
  SpindownDisk,
} from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  AlertCircle,
  Container,
  Moon,
  Plug,
  Plus,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { SaveBar } from '../components/SaveBar'
import { Select } from '../components/Select'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import {
  useConfig,
  useDockerContainers,
  useEngineSettings,
  useMaintenanceSettings,
  useSaveEngineSettings,
  useSaveMaintenanceSettings,
  useSpindownStatus,
} from '../hooks/queries'
import { engineApi } from '../lib/api/engine'
import { getCommandLabel } from '../lib/commands'
import { formatRelativeTime } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

export const Route = createFileRoute('/automation')({
  component: AutomationPage,
})

// The jobs that read the array, in the order they usually run
const PAUSABLE_COMMANDS: SnapRaidCommand[] = [
  'touch',
  'sync',
  'scrub',
  'check',
  'fix',
]

const fieldClass = 'flex flex-col gap-2'
const hintClass = 'text-xs text-muted-foreground'

function AutomationPage() {
  const maintenance = useMaintenanceSettings()
  const engine = useEngineSettings()
  const isLoading = maintenance.isLoading || engine.isLoading
  const error = maintenance.error ?? engine.error

  return (
    <PageLayout
      title={m.nav_automation()}
      description={<p className="max-w-3xl">{m.automation_intro()}</p>}
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
      {maintenance.data && engine.data && (
        <AutomationForm
          initial={maintenance.data}
          initialEngine={engine.data}
          daemonActive={engine.data.active === 'daemon'}
        />
      )}
    </PageLayout>
  )
}

// The engine settings without the server's note which engine runs
const engineSettingsOf = ({
  mode,
  daemons,
}: EngineSettings): EngineSettings => ({
  mode,
  daemons,
})

function AutomationForm({
  initial,
  initialEngine,
  daemonActive,
}: {
  initial: MaintenanceSettings
  initialEngine: EngineSettings
  daemonActive: boolean
}) {
  const { toast } = useFeedback()
  const save = useSaveMaintenanceSettings()
  const saveEngine = useSaveEngineSettings()
  const [settings, setSettings] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [engine, setEngine] = useState(engineSettingsOf(initialEngine))
  const [savedEngine, setSavedEngine] = useState(
    engineSettingsOf(initialEngine),
  )
  const maintenanceDirty = JSON.stringify(settings) !== JSON.stringify(saved)
  const engineDirty = JSON.stringify(engine) !== JSON.stringify(savedEngine)
  const dirty = maintenanceDirty || engineDirty
  const pending = save.isPending || saveEngine.isPending

  const update = <K extends keyof MaintenanceSettings>(
    section: K,
    changes: Partial<MaintenanceSettings[K]>,
  ) => setSettings((s) => ({ ...s, [section]: { ...s[section], ...changes } }))

  const handleSave = async () => {
    try {
      if (maintenanceDirty) {
        const result = await save.mutateAsync(settings)
        setSettings(result)
        setSaved(result)
      }
      if (engineDirty) {
        const result = engineSettingsOf(await saveEngine.mutateAsync(engine))
        setEngine(result)
        setSavedEngine(result)
      }
      toast.success(m.automation_saved())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <SectionCard
        icon={<Container />}
        iconClass="bg-sky-50 text-sky-700"
        title={m.automation_docker_title()}
        description={m.automation_docker_desc()}
        enabled={settings.dockerPause.enabled}
        onToggle={(enabled) => update('dockerPause', { enabled })}
      >
        <DockerPauseFields
          settings={settings.dockerPause}
          onChange={(changes) => update('dockerPause', changes)}
        />
      </SectionCard>

      <SectionCard
        icon={<Moon />}
        iconClass="bg-indigo-50 text-indigo-700"
        title={m.automation_spindown_title()}
        description={m.automation_spindown_desc()}
        enabled={settings.spindown.enabled}
        onToggle={(enabled) => update('spindown', { enabled })}
      >
        <SpindownFields
          settings={settings.spindown}
          active={saved.spindown.enabled}
          onChange={(changes) => update('spindown', changes)}
        />
      </SectionCard>

      <SectionCard
        icon={<Activity />}
        iconClass="bg-orange-50 text-orange-700"
        title={m.automation_metrics_title()}
        description={m.automation_metrics_desc()}
        enabled={settings.metrics.enabled}
        onToggle={(enabled) =>
          // A token from the start, the metrics name disks and paths
          update('metrics', {
            enabled,
            token: settings.metrics.token || newToken(),
          })
        }
      >
        <MetricsFields
          settings={settings.metrics}
          onChange={(changes) => update('metrics', changes)}
        />
      </SectionCard>

      <SectionCard
        icon={<Plug />}
        iconClass="bg-amber-50 text-amber-700"
        title={m.automation_daemon_title()}
        badge={
          <>
            <Badge variant="warning">{m.automation_daemon_badge()}</Badge>
            {daemonActive && (
              <Badge variant="success">{m.automation_daemon_active()}</Badge>
            )}
          </>
        }
        description={m.automation_daemon_desc()}
        enabled={engine.mode === 'daemon'}
        onToggle={(enabled) =>
          setEngine((s) => ({
            mode: enabled ? 'daemon' : 'cli',
            // Most hosts run one daemon, its form is there right away
            daemons:
              enabled && s.daemons.length === 0 ? [newTarget(7627)] : s.daemons,
          }))
        }
      >
        <DaemonList
          daemons={engine.daemons}
          onChange={(daemons) => setEngine((s) => ({ ...s, daemons }))}
        />
      </SectionCard>

      <SaveBar hint={dirty && m.automation_unsaved()}>
        <Button
          variant="outline"
          onClick={() => {
            setSettings(saved)
            setEngine(savedEngine)
          }}
          disabled={!dirty || pending}
        >
          {m.common_cancel()}
        </Button>
        <Button onClick={handleSave} disabled={!dirty || pending}>
          {m.common_save()}
        </Button>
      </SaveBar>
    </div>
  )
}

const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

function MetricsFields({
  settings,
  onChange,
}: {
  settings: MaintenanceSettings['metrics']
  onChange: (changes: Partial<MaintenanceSettings['metrics']>) => void
}) {
  const url =
    typeof window === 'undefined'
      ? '/api/metrics'
      : `${window.location.origin}/api/metrics`
  const target = url.replace(/^https?:\/\//, '').replace(/\/api\/metrics$/, '')
  const scrapeConfig = [
    'scrape_configs:',
    '  - job_name: snapraid',
    '    metrics_path: /api/metrics',
    ...(url.startsWith('https:') ? ['    scheme: https'] : []),
    ...(settings.token
      ? ['    authorization:', `      credentials: ${settings.token}`]
      : []),
    '    static_configs:',
    `      - targets: ['${target}']`,
  ].join('\n')

  return (
    <>
      <div className={fieldClass}>
        <Label htmlFor="metrics-token">{m.automation_metrics_token()}</Label>
        <div className="flex max-w-xl gap-2">
          <Input
            id="metrics-token"
            value={settings.token}
            onChange={(e) => onChange({ token: e.target.value })}
            autoComplete="off"
            className="bg-background font-mono"
          />
          <Button
            variant="outline"
            onClick={() => onChange({ token: newToken() })}
          >
            {m.automation_metrics_new_token()}
          </Button>
        </div>
        <p className={hintClass}>{m.automation_metrics_token_hint()}</p>
      </div>
      <div className={fieldClass}>
        <span className="text-sm font-medium">
          {m.automation_metrics_scrape()}
        </span>
        <pre className="overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs">
          {scrapeConfig}
        </pre>
      </div>
      <p className={hintClass}>{m.automation_metrics_hint()}</p>
    </>
  )
}

function DockerPauseFields({
  settings,
  onChange,
}: {
  settings: MaintenanceSettings['dockerPause']
  onChange: (changes: Partial<MaintenanceSettings['dockerPause']>) => void
}) {
  const { data: report, isFetching } = useDockerContainers(
    settings.socketPath,
    true,
  )
  const known = new Set(report?.containers.map((container) => container.name))
  // Picked before, but gone from the socket (removed or renamed)
  const missing = settings.containers.filter((name) => !known.has(name))

  const toggleContainer = (name: string, checked: boolean) =>
    onChange({
      containers: checked
        ? [...settings.containers, name]
        : settings.containers.filter((picked) => picked !== name),
    })

  const toggleCommand = (command: SnapRaidCommand, checked: boolean) =>
    onChange({
      commands: checked
        ? PAUSABLE_COMMANDS.filter(
            (c) => c === command || settings.commands.includes(c),
          )
        : settings.commands.filter((c) => c !== command),
    })

  return (
    <>
      <div className={fieldClass}>
        <Label htmlFor="docker-socket">{m.automation_docker_socket()}</Label>
        <Input
          id="docker-socket"
          value={settings.socketPath}
          onChange={(e) => onChange({ socketPath: e.target.value })}
          className="max-w-md bg-background font-mono"
        />
        {isFetching && !report ? (
          <p className={hintClass}>{m.automation_docker_checking()}</p>
        ) : report?.available ? (
          <p className="text-xs font-medium text-green-700">
            ✓{' '}
            {m.automation_docker_connected({
              count: report.containers.length,
            })}
          </p>
        ) : (
          report && (
            <Alert variant="warning">
              <AlertCircle />
              <AlertDescription className="text-inherit">
                <p>
                  {m.automation_docker_unavailable({
                    error: report.error ?? '',
                  })}
                </p>
                <p>{m.automation_docker_mount_hint()}</p>
                <pre className="mt-1 rounded-md bg-background/70 px-3 py-2 font-mono text-xs">
                  {`volumes:\n  - ${settings.socketPath || '/var/run/docker.sock'}:/var/run/docker.sock`}
                </pre>
              </AlertDescription>
            </Alert>
          )
        )}
      </div>

      {report?.available && (
        <div className={fieldClass}>
          <span className="text-sm font-medium">
            {m.automation_docker_containers()}
          </span>
          {report.containers.length === 0 && missing.length === 0 ? (
            <p className={hintClass}>{m.automation_docker_none()}</p>
          ) : (
            <div className="grid gap-1.5 rounded-lg border bg-background p-2 sm:grid-cols-2">
              {report.containers.map((container) => (
                <ContainerOption
                  key={container.id}
                  container={container}
                  checked={settings.containers.includes(container.name)}
                  onCheckedChange={(checked) =>
                    toggleContainer(container.name, checked)
                  }
                />
              ))}
              {missing.map((name) => (
                <ContainerOption
                  key={name}
                  container={{ id: name, name, image: '', state: '' }}
                  missing
                  checked
                  onCheckedChange={(checked) => toggleContainer(name, checked)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className={fieldClass}>
        <span className="text-sm font-medium">
          {m.automation_docker_commands()}
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {PAUSABLE_COMMANDS.map((command) => (
            <Label
              key={command}
              className="flex items-center gap-2 font-normal"
            >
              <Checkbox
                checked={settings.commands.includes(command)}
                onCheckedChange={(checked) =>
                  toggleCommand(command, checked === true)
                }
              />
              {getCommandLabel(command)}
            </Label>
          ))}
        </div>
      </div>
      <p className={hintClass}>{m.automation_docker_hint()}</p>
    </>
  )
}

const STATE_BADGE: Record<string, 'success' | 'secondary' | 'warning'> = {
  running: 'success',
  paused: 'warning',
}

// Docker's own states, the rare ones (created, restarting, dead) stay as Docker names them
const STATE_LABEL: Record<string, () => string> = {
  running: m.automation_state_running,
  paused: m.automation_state_paused,
  exited: m.automation_state_exited,
}

function ContainerOption({
  container,
  checked,
  missing = false,
  onCheckedChange,
}: {
  container: DockerContainer
  checked: boolean
  missing?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Label
      className={`flex items-center gap-3 rounded-md px-2 py-1.5 font-normal hover:bg-muted/60 ${container.self ? 'opacity-60' : ''}`}
      title={container.self ? m.automation_docker_self() : container.image}
    >
      <Checkbox
        checked={checked}
        disabled={container.self}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{container.name}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {container.self
            ? m.automation_docker_self()
            : missing
              ? m.automation_docker_missing()
              : container.image}
        </span>
      </span>
      {container.state && (
        <Badge variant={STATE_BADGE[container.state] ?? 'secondary'}>
          {STATE_LABEL[container.state]?.() ?? container.state}
        </Badge>
      )}
    </Label>
  )
}

function SpindownFields({
  settings,
  active,
  onChange,
}: {
  settings: MaintenanceSettings['spindown']
  active: boolean // Saved as enabled, the monitor is watching
  onChange: (changes: Partial<MaintenanceSettings['spindown']>) => void
}) {
  const { data: status } = useSpindownStatus(active)

  return (
    <>
      <div className={fieldClass}>
        <Label htmlFor="spindown-idle">{m.automation_spindown_idle()}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="spindown-idle"
            type="number"
            min={5}
            max={1440}
            value={settings.idleMinutes}
            onChange={(e) =>
              onChange({ idleMinutes: Number(e.target.value) || 0 })
            }
            className="w-24 bg-background"
          />
          <span className="text-sm text-muted-foreground">
            {m.automation_spindown_minutes()}
          </span>
        </div>
        <p className={hintClass}>{m.automation_spindown_hint()}</p>
      </div>

      <div className={fieldClass}>
        <span className="text-sm font-medium">
          {m.automation_spindown_disks()}
        </span>
        {!active ? (
          <p className={hintClass}>{m.automation_spindown_waiting()}</p>
        ) : status?.error ? (
          <Alert variant="warning">
            <AlertCircle />
            <AlertDescription className="text-inherit">
              {m.automation_spindown_error({ error: status.error })}
            </AlertDescription>
          </Alert>
        ) : status && status.disks.length === 0 ? (
          <p className={hintClass}>{m.automation_spindown_no_disks()}</p>
        ) : (
          <div className="divide-y rounded-lg border bg-background">
            {status?.disks.map((disk) => (
              <SpindownRow
                key={`${disk.configPath}|${disk.disk}`}
                disk={disk}
                idleMinutes={status.idleMinutes}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function SpindownRow({
  disk,
  idleMinutes,
}: {
  disk: SpindownDisk
  idleMinutes: number
}) {
  const locale = getLocale()
  const sleepsAt = new Date(
    new Date(disk.lastActivity).getTime() + idleMinutes * 60_000,
  ).toISOString()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span
        className={`size-2 shrink-0 rounded-full ${disk.spunDownAt ? 'border-2 border-gray-400' : 'ui-led bg-green-500'}`}
      />
      <span className="font-medium">{disk.disk}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {disk.device}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {disk.spunDownAt
          ? m.automation_spindown_asleep({
              time: formatRelativeTime(disk.spunDownAt, locale),
            })
          : `${m.automation_spindown_active({
              time: formatRelativeTime(disk.lastActivity, locale),
            })} · ${m.automation_spindown_due({
              time: formatRelativeTime(sleepsAt, locale),
            })}`}
      </span>
    </div>
  )
}

const DAEMON_WARNING: Record<DaemonWarning, () => string> = {
  schedule: m.automation_daemon_warn_schedule,
  spindown: m.automation_daemon_warn_spindown,
  docker_pause: m.automation_daemon_warn_docker_pause,
  notifications: m.automation_daemon_warn_notifications,
  other_array: m.automation_daemon_warn_other_array,
}

// snapraid-daemon listens on 7627, further instances usually on the next ports
const newTarget = (port: number): DaemonTarget => ({
  configPath: '',
  url: `http://127.0.0.1:${port}`,
  username: '',
  password: '',
})

// One daemon per array: each entry is a snapraidd instance (snapraidd@<name>) with its own port
function DaemonList({
  daemons,
  onChange,
}: {
  daemons: DaemonTarget[]
  onChange: (daemons: DaemonTarget[]) => void
}) {
  const { data: config } = useConfig()
  const configs = config?.snapraidConfigs ?? []
  const free = configs.filter(
    (entry) => !daemons.some((target) => target.configPath === entry.path),
  )

  const update = (index: number, changes: Partial<DaemonTarget>) =>
    onChange(
      daemons.map((target, i) =>
        i === index ? { ...target, ...changes } : target,
      ),
    )

  return (
    <>
      {daemons.map((target, index) => (
        <DaemonFields
          // Entries have no id; one is only ever added at the end or removed as a whole
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          index={index}
          target={target}
          configOptions={configs.filter(
            (entry) =>
              entry.path === target.configPath ||
              !daemons.some((other) => other.configPath === entry.path),
          )}
          onChange={(changes) => update(index, changes)}
          onRemove={
            daemons.length > 1
              ? () => onChange(daemons.filter((_, i) => i !== index))
              : undefined
          }
        />
      ))}
      {free.length > 0 && daemons.length > 0 && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([...daemons, newTarget(7627 + daemons.length)])
            }
          >
            <Plus />
            {m.automation_daemon_add()}
          </Button>
        </div>
      )}
      <p className={hintClass}>{m.automation_daemon_hint()}</p>
    </>
  )
}

function DaemonFields({
  index,
  target,
  configOptions,
  onChange,
  onRemove,
}: {
  index: number
  target: DaemonTarget
  configOptions: Array<{ name: string; path: string }>
  onChange: (changes: Partial<DaemonTarget>) => void
  onRemove?: () => void
}) {
  const [check, setCheck] = useState<DaemonCheck | null>(null)
  const [testing, setTesting] = useState(false)
  const daemon = target
  const id = (field: string) => `daemon-${index}-${field}`

  const handleTest = async () => {
    setTesting(true)
    try {
      setCheck(await engineApi.test(target))
    } catch (error) {
      setCheck({ ok: false, error: errorMessage(error), warnings: [] })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-background/60 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`${fieldClass} sm:col-span-2`}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id('config')}>{m.automation_daemon_config()}</Label>
            {onRemove && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 />
                {m.automation_daemon_remove()}
              </Button>
            )}
          </div>
          <Select
            id={id('config')}
            size="sm"
            value={daemon.configPath}
            onChange={(configPath) => onChange({ configPath })}
            options={[
              ...(daemon.configPath
                ? []
                : [{ value: '', label: m.automation_daemon_config_none() }]),
              ...configOptions.map((entry) => ({
                value: entry.path,
                label: entry.name,
                hint: entry.path,
              })),
            ]}
          />
        </div>
        <div className={`${fieldClass} sm:col-span-2`}>
          <Label htmlFor={id('url')}>{m.automation_daemon_url()}</Label>
          <Input
            id={id('url')}
            type="url"
            value={daemon.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="http://127.0.0.1:7627"
            className="bg-background font-mono"
          />
        </div>
        <div className={fieldClass}>
          <Label htmlFor={id('username')}>
            {m.automation_daemon_username()}
          </Label>
          <Input
            id={id('username')}
            value={daemon.username}
            onChange={(e) => onChange({ username: e.target.value })}
            autoComplete="off"
            className="bg-background"
          />
        </div>
        <div className={fieldClass}>
          <Label htmlFor={id('password')}>
            {m.automation_daemon_password()}
          </Label>
          <Input
            id={id('password')}
            type="password"
            value={daemon.password}
            onChange={(e) => onChange({ password: e.target.value })}
            autoComplete="new-password"
            className="bg-background"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !daemon.url}
          >
            <Plug />
            {testing
              ? m.automation_daemon_testing()
              : m.automation_daemon_test()}
          </Button>
        </div>
        {check?.ok && (
          <p className="text-xs font-medium text-green-700">
            ✓{' '}
            {m.automation_daemon_connected({
              daemon: check.daemonVersion ?? '?',
              engine: check.engineVersion ?? '?',
              conf: check.engineConf ?? '?',
            })}
          </p>
        )}
        {check && !check.ok && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="text-inherit">
              {m.automation_daemon_failed({ error: check.error ?? '' })}
            </AlertDescription>
          </Alert>
        )}
        {check?.warnings.map((warning) => (
          <Alert key={warning} variant="warning">
            <AlertCircle />
            <AlertDescription className="text-inherit">
              {DAEMON_WARNING[warning]()}
            </AlertDescription>
          </Alert>
        ))}
      </div>
    </div>
  )
}

function SectionCard({
  icon,
  iconClass,
  title,
  badge,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode
  iconClass: string
  title: string
  badge?: ReactNode
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: ReactNode
}) {
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
            {badge}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={title}
        />
      </div>
      {enabled && (
        <div className="ui-fade-in flex flex-col gap-4 border-t bg-muted/50 px-5 py-4">
          {children}
        </div>
      )}
    </Card>
  )
}
