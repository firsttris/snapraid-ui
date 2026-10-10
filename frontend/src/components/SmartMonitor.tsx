import { ATTRIBUTE_INFO } from '@shared/smart-attributes'
import {
  assessSmart,
  attributeLevel,
  CRC_ATTRIBUTE_ID,
  CRITICAL_CELSIUS,
  CRITICAL_FAILURE_PROBABILITY,
  CRITICAL_WEAR_PERCENT,
  DEFAULT_SMART_FAILURE_THRESHOLD,
  type ErrorAttribute,
  HOT_CELSIUS,
  type SmartAssessment,
  type SmartHint,
  type SmartLevel,
  type SmartReason,
  smartHints,
  WORN_PERCENT,
} from '@shared/smart-health'
import type {
  DiskSelfTest,
  SmartDiskInfo,
  SmartHistoryPoint,
} from '@shared/types'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleCheck,
  Moon,
  OctagonAlert,
  Wrench,
} from 'lucide-react'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import {
  useNotificationSettings,
  useSelfTests,
  useSmart,
  useSmartHistory,
} from '../hooks/queries'
import { ATTRIBUTE_TEXT } from '../lib/smart-attributes'
import { cn } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { SmartSelfTest } from './SmartSelfTest'
import { hasSmartHistory } from './smartHistory'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

// chart.js is only loaded once the history tab is opened
const SmartHistoryCharts = lazy(() =>
  import('./SmartHistoryCharts').then((module) => ({
    default: module.SmartHistoryCharts,
  })),
)

interface SmartMonitorProps {
  configPath: string
}

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary'

const STATUS_VARIANT: Record<SmartDiskInfo['status'], BadgeVariant> = {
  OK: 'success',
  FAIL: 'destructive',
  PREFAIL: 'destructive',
  LOGFAIL: 'warning',
  LOGERR: 'warning',
  SELFERR: 'warning',
  UNKNOWN: 'secondary',
}

const LEVEL_STYLES: Record<
  SmartLevel,
  { card: string; dot: string; text: string; box: string }
> = {
  ok: { card: '', dot: 'bg-green-500', text: '', box: '' },
  warning: {
    card: 'border-yellow-500/50',
    dot: 'bg-yellow-500',
    text: 'text-yellow-700',
    box: 'bg-yellow-50 text-yellow-800',
  },
  critical: {
    card: 'border-red-500/60',
    dot: 'bg-red-500',
    text: 'text-red-700',
    box: 'bg-red-50 text-red-800',
  },
}

const LEVEL_LABEL: Record<Exclude<SmartLevel, 'ok'>, () => string> = {
  warning: m.smart_level_warning,
  critical: m.smart_level_critical,
}

const LEVEL_BADGE: Record<Exclude<SmartLevel, 'ok'>, BadgeVariant> = {
  warning: 'warning',
  critical: 'destructive',
}

// Raw SMART status while all is fine, the verdict once something stands out
const StatusBadge = ({
  disk,
  level,
}: {
  disk: SmartDiskInfo
  level: SmartLevel
}) =>
  disk.standby ? (
    <Badge variant="secondary">
      <Moon />
      {m.smart_monitor_standby()}
    </Badge>
  ) : level === 'ok' ? (
    <Badge variant={STATUS_VARIANT[disk.status]}>{disk.status}</Badge>
  ) : (
    <Badge variant={LEVEL_BADGE[level]}>{LEVEL_LABEL[level]()}</Badge>
  )

const ERROR_TEXT: Record<
  ErrorAttribute,
  (inputs: { count: number }) => string
> = {
  reported_uncorrectable: m.smart_reason_reported_uncorrectable,
  crc: m.smart_reason_crc,
  medium: m.smart_reason_medium_errors,
}

export const describeSmartReason = (reason: SmartReason): string => {
  switch (reason.kind) {
    case 'status':
      switch (reason.status) {
        case 'FAIL':
          return m.smart_reason_status_fail()
        case 'PREFAIL':
          return m.smart_reason_status_prefail()
        case 'LOGFAIL':
          return m.smart_reason_status_logfail()
        case 'LOGERR':
          return m.smart_reason_status_logerr()
        case 'SELFERR':
          return m.smart_reason_status_selferr()
        default:
          return reason.status
      }
    case 'unreadable':
      return m.smart_reason_unreadable()
    case 'errors':
      return ERROR_TEXT[reason.attribute]({ count: reason.count })
    case 'wear':
      return m.smart_reason_wear({ percent: reason.percent })
    case 'failure_probability':
      return m.smart_reason_probability({
        percent: formatPercent(reason.percent, 1),
      })
    case 'temperature':
      return m.smart_reason_temperature({ celsius: reason.celsius })
    case 'sectors':
      switch (reason.attribute) {
        case 'reallocated':
          return m.smart_reason_reallocated({ count: reason.count })
        case 'pending':
          return m.smart_reason_pending({ count: reason.count })
        case 'uncorrectable':
          return m.smart_reason_uncorrectable({ count: reason.count })
      }
  }
}

const HINT_TEXT: Record<SmartHint, () => string> = {
  replace: m.smart_hint_replace,
  cable: m.smart_hint_cable,
  cooling: m.smart_hint_cooling,
  access: m.smart_hint_access,
}

// SnapRAID rates healthy disks at a few percent per year, only the threshold is worth a color
const getFailureProbabilityColor = (probability: number, threshold: number) =>
  probability >= CRITICAL_FAILURE_PROBABILITY
    ? 'text-red-700'
    : probability >= threshold
      ? 'text-orange-700'
      : ''

const formatPercent = (value: number, digits: number) =>
  value.toLocaleString(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

// Same limits as assessSmart, warm is still fine
const temperatureLevel = (celsius: number): SmartLevel =>
  celsius >= CRITICAL_CELSIUS
    ? 'critical'
    : celsius > HOT_CELSIUS
      ? 'warning'
      : 'ok'

const TEMPERATURE_TEXT: Record<SmartLevel, string> = {
  ok: '',
  warning: 'text-orange-700',
  critical: 'text-red-700',
}

const TEMPERATURE_BAR: Record<SmartLevel, string> = {
  ok: 'bg-green-500',
  warning: 'bg-orange-500',
  critical: 'bg-red-500',
}

const getWearColor = (percent: number) =>
  percent >= CRITICAL_WEAR_PERCENT
    ? 'text-red-700'
    : percent >= WORN_PERCENT
      ? 'text-orange-700'
      : ''

const ATTRIBUTE_ROW_STYLES: Record<SmartLevel, string> = {
  ok: '',
  warning: 'bg-yellow-50 text-yellow-800 hover:bg-yellow-50',
  critical: 'bg-red-50 text-red-800 font-semibold hover:bg-red-50',
}

const formatYears = (hours: number) =>
  (hours / 24 / 365).toLocaleString(getLocale(), { maximumFractionDigits: 1 })

const driveType = (disk: SmartDiskInfo) =>
  disk.rotationRate === undefined
    ? undefined
    : disk.rotationRate === 0
      ? m.smart_monitor_ssd()
      : m.smart_monitor_hdd({ rpm: disk.rotationRate })

// Disks outside the array have no name, the device tells them apart
const diskKey = (disk: SmartDiskInfo) => `${disk.device}:${disk.name}`
const diskAnchor = (disk: SmartDiskInfo) =>
  `smart-disk-${diskKey(disk).replace(/[^\w-]/g, '_')}`
const DETAILS_ID = 'smart-details'

const hasAttributeProblem = (disk: SmartDiskInfo) =>
  (disk.attributes ?? []).some((attr) => attributeLevel(attr, disk) !== 'ok')

// Transfer errors that stopped growing, a past cable problem worth a mention but no warning
const StableCrcNote = ({ disk }: { disk: SmartDiskInfo }) => {
  const raw = disk.attributes?.find((attr) => attr.id === CRC_ATTRIBUTE_ID)?.raw
  if (!disk.crcStableSince || !raw) return null
  return (
    <p className="text-xs text-muted-foreground">
      {m.smart_crc_stable({
        count: Number.parseInt(raw, 10).toLocaleString(getLocale()),
        date: new Date(disk.crcStableSince).toLocaleDateString(getLocale()),
      })}
    </p>
  )
}

const Stat = ({
  label,
  title,
  className,
  children,
}: {
  label: string
  title?: string
  className?: string
  children: ReactNode
}) => (
  <div className="min-w-0" title={title}>
    <div className="truncate text-xs text-muted-foreground">{label}</div>
    <div
      className={cn(
        'truncate text-lg font-semibold tabular-nums tracking-tight',
        className,
      )}
    >
      {children}
    </div>
  </div>
)

const Unit = ({ children }: { children: ReactNode }) => (
  <span className="ml-0.5 text-sm font-normal text-muted-foreground">
    {children}
  </span>
)

const DiskCard = ({
  disk,
  assessment,
  threshold,
  selected,
  onSelect,
  selfTest,
}: {
  disk: SmartDiskInfo
  assessment: SmartAssessment
  threshold: number
  selected: boolean
  onSelect: () => void
  selfTest?: DiskSelfTest
}) => {
  const style = LEVEL_STYLES[assessment.level]
  const tempLevel =
    disk.temperature === undefined ? 'ok' : temperatureLevel(disk.temperature)
  const missing = <span className="text-muted-foreground">–</span>

  return (
    <Card
      lift
      id={diskAnchor(disk)}
      className={cn(
        'relative scroll-mt-4 gap-4 p-5 has-[[data-select]:focus-visible]:ring-[3px] has-[[data-select]:focus-visible]:ring-ring/50',
        style.card,
        selected && 'ring-2 ring-ring',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full',
                disk.standby ? 'bg-muted-foreground' : style.dot,
              )}
            />
            {/* Covers the whole card, a click anywhere picks the disk */}
            <button
              type="button"
              data-select
              onClick={onSelect}
              aria-pressed={selected}
              aria-controls={DETAILS_ID}
              className="truncate text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {disk.name}
            </button>
          </h3>
          {(disk.model || disk.size) && (
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {[disk.model, disk.size].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[disk.device, disk.interface, driveType(disk)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <StatusBadge disk={disk} level={assessment.level} />
      </div>

      {selfTest?.running && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400">
          <Activity className="size-3.5" />
          {selfTest.running.remainingPercent !== undefined
            ? m.selftest_card_running_percent({
                percent: selfTest.running.remainingPercent,
              })
            : m.selftest_running()}
        </p>
      )}

      {disk.standby ? (
        <p className="text-sm text-muted-foreground">
          {m.smart_monitor_standby_hint()}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label={m.smart_monitor_temperature()}
              className={TEMPERATURE_TEXT[tempLevel]}
            >
              {disk.temperature === undefined ? (
                missing
              ) : (
                <>
                  {disk.temperature}
                  <Unit>°C</Unit>
                </>
              )}
            </Stat>
            <Stat
              label={m.smart_stat_failure()}
              title={`${m.smart_monitor_failure_probability()} ${m.smart_monitor_per_year()}`}
              className={
                disk.failureProbability === undefined
                  ? ''
                  : getFailureProbabilityColor(
                      disk.failureProbability,
                      threshold,
                    )
              }
            >
              {disk.failureProbability === undefined ? (
                missing
              ) : (
                <>
                  {formatPercent(disk.failureProbability, 2)}
                  <Unit>%</Unit>
                </>
              )}
            </Stat>
            <Stat
              label={m.smart_stat_power_on()}
              title={
                disk.powerOnHours === undefined
                  ? undefined
                  : `${disk.powerOnHours.toLocaleString(getLocale())} ${m.smart_monitor_hours()} (${formatYears(disk.powerOnHours)} ${m.smart_monitor_years()})`
              }
            >
              {disk.powerOnHours === undefined ? (
                missing
              ) : (
                <>
                  {formatYears(disk.powerOnHours)}
                  <Unit>{m.smart_unit_years_short()}</Unit>
                </>
              )}
            </Stat>
          </div>

          {/* Counters are only worth a line when they count something */}
          {(disk.wearLevel !== undefined ||
            !!disk.errorMedium ||
            !!disk.errorProtocol) && (
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {disk.wearLevel !== undefined && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">
                    {m.smart_monitor_wear_level()}
                  </dt>
                  <dd
                    className={cn(
                      'font-medium tabular-nums',
                      getWearColor(disk.wearLevel),
                    )}
                  >
                    {disk.wearLevel} %
                  </dd>
                </div>
              )}
              {!!disk.errorMedium && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">
                    {m.smart_monitor_media_errors()}
                  </dt>
                  <dd className="font-medium tabular-nums text-orange-700">
                    {disk.errorMedium.toLocaleString(getLocale())}
                  </dd>
                </div>
              )}
              {!!disk.errorProtocol && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">
                    {m.smart_monitor_error_log()}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {disk.errorProtocol.toLocaleString(getLocale())}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {disk.temperature !== undefined && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              title={m.smart_temperature_bar({
                celsius: disk.temperature,
                critical: CRITICAL_CELSIUS,
              })}
            >
              <div
                className={cn(
                  'ui-bar ui-bar-glow h-full rounded-full',
                  TEMPERATURE_BAR[tempLevel],
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, (disk.temperature / CRITICAL_CELSIUS) * 100))}%`,
                }}
              />
            </div>
          )}
        </>
      )}

      {assessment.reasons.length > 0 && (
        <ul className={cn('space-y-1 rounded-md p-2.5 text-xs', style.box)}>
          {assessment.reasons.map((reason) => (
            <li key={reason.kind + describeSmartReason(reason)}>
              {describeSmartReason(reason)}
            </li>
          ))}
        </ul>
      )}

      <StableCrcNote disk={disk} />
    </Card>
  )
}

/**
 * The attributes in plain words: what each measures and whether the value is fine; the ones
 * that say something about the disk's health first, the rest on request
 */
const AttributeTable = ({ disk }: { disk: SmartDiskInfo }) => {
  const [showAll, setShowAll] = useState(false)
  const rows = (disk.attributes ?? []).map((attribute) => ({
    attribute,
    level: attributeLevel(attribute, disk),
    info: ATTRIBUTE_INFO[attribute.id],
  }))
  const important = rows.filter(
    ({ level, info }) => level !== 'ok' || info?.important,
  )
  const others = rows.filter((row) => !important.includes(row))
  const shown = showAll ? [...important, ...others] : important

  return (
    <>
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>{m.smart_attr_col_attribute()}</TableHead>
            <TableHead className="text-right">
              {m.smart_monitor_value()}
            </TableHead>
            <TableHead className="text-right">
              {m.smart_monitor_worst()}
            </TableHead>
            <TableHead className="text-right">
              {m.smart_monitor_threshold()}
            </TableHead>
            <TableHead className="text-right">
              {m.smart_monitor_raw()}
            </TableHead>
            <TableHead>{m.smart_attr_col_assessment()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ attribute, level, info }) => {
            const text = info && ATTRIBUTE_TEXT[info.key]
            return (
              <TableRow
                key={attribute.id}
                className={ATTRIBUTE_ROW_STYLES[level]}
              >
                <TableCell className="max-w-md whitespace-normal">
                  <div className="font-medium">
                    {text ? text.name() : attribute.name}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {attribute.id} · {attribute.name}
                  </div>
                  {text && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {text.description()}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right align-top font-mono tabular-nums">
                  {attribute.value}
                </TableCell>
                <TableCell className="text-right align-top font-mono tabular-nums">
                  {attribute.worst}
                </TableCell>
                <TableCell className="text-right align-top font-mono tabular-nums">
                  {attribute.threshold}
                </TableCell>
                <TableCell className="text-right align-top font-mono tabular-nums">
                  {attribute.raw}
                </TableCell>
                <TableCell className="align-top" title={attribute.flag}>
                  {level === 'ok' ? (
                    <span className="text-xs text-muted-foreground">
                      {m.smart_attr_ok()}
                    </span>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn(
                        'border-transparent bg-card',
                        LEVEL_STYLES[level].text,
                      )}
                    >
                      {LEVEL_LABEL[level]()}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {m.smart_attr_values_hint()}
        </p>
        {others.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? m.smart_attr_show_important()
              : m.smart_attr_show_all({ count: others.length })}
          </Button>
        )}
      </div>
    </>
  )
}

type DetailTab = 'attributes' | 'history' | 'selftest'

const DiskDetails = ({
  disk,
  history,
  configPath,
  selfTests,
}: {
  disk: SmartDiskInfo
  history: SmartHistoryPoint[] | undefined
  configPath: string
  selfTests: ReturnType<typeof useSelfTests>
}) => {
  const [tab, setTab] = useState<DetailTab>('attributes')
  const attributes = disk.attributes ?? []
  const tabs: DetailTab[] = [
    ...(attributes.length > 0 ? (['attributes'] as const) : []),
    ...(hasSmartHistory(history) ? (['history'] as const) : []),
    'selftest' as const,
  ]
  // Another disk may lack the tab that was open
  const current = tabs.includes(tab) ? tab : tabs[0]

  const facts = [
    disk.family,
    disk.serial && `${m.smart_monitor_serial()} ${disk.serial}`,
    disk.powerOnHours !== undefined &&
      `${disk.powerOnHours.toLocaleString(getLocale())} ${m.smart_monitor_hours()} (${m.smart_monitor_power_on_hours()})`,
  ].filter(Boolean)

  return (
    <Card id={DETAILS_ID} className="scroll-mt-4 gap-0 overflow-hidden py-0">
      <Tabs
        value={current}
        onValueChange={(value) => setTab(value as DetailTab)}
        className="gap-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {disk.name}
              {current === 'attributes' && (
                <>
                  {' · '}
                  {m.smart_monitor_attributes()}
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({attributes.length})
                  </span>
                </>
              )}
            </h2>
            {facts.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {facts.join(' · ')}
              </p>
            )}
          </div>
          {tabs.length > 0 && (
            <TabsList className="max-w-full justify-start overflow-x-auto">
              {tabs.includes('attributes') && (
                <TabsTrigger value="attributes">
                  {m.smart_monitor_attributes()}
                </TabsTrigger>
              )}
              {tabs.includes('history') && (
                <TabsTrigger value="history">
                  {m.smart_history_title({
                    days: String(history?.length ?? 0),
                  })}
                </TabsTrigger>
              )}
              <TabsTrigger value="selftest">{m.selftest_tab()}</TabsTrigger>
            </TabsList>
          )}
        </div>

        {!tabs.includes('attributes') && !tabs.includes('history') && (
          <p className="border-t px-5 py-4 text-sm text-muted-foreground">
            {disk.standby
              ? m.smart_monitor_standby_hint()
              : m.smart_reason_unreadable()}
          </p>
        )}

        <TabsContent value="attributes" className="border-t">
          <AttributeTable disk={disk} />
        </TabsContent>

        <TabsContent value="history" className="border-t p-5">
          <Suspense fallback={null}>
            <SmartHistoryCharts points={history} />
          </Suspense>
        </TabsContent>

        <TabsContent value="selftest" className="border-t">
          <SmartSelfTest
            configPath={configPath}
            test={selfTests.data?.find((test) => test.disk === disk.name)}
            loading={selfTests.isLoading}
            powerOnHours={disk.powerOnHours}
            onRefresh={() => selfTests.refetch()}
            refreshing={selfTests.isFetching}
          />
        </TabsContent>
      </Tabs>
    </Card>
  )
}

export const SmartMonitor = ({ configPath }: SmartMonitorProps) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const {
    data: report,
    isLoading: loading,
    error: queryError,
  } = useSmart(configPath || undefined)
  const error = queryError?.message
  const { data: history } = useSmartHistory(
    configPath || undefined,
    report?.timestamp,
  )
  const selfTests = useSelfTests(configPath || undefined)

  // Same threshold as the SMART notifications, so the page and the messages agree
  const { data: notificationSettings } = useNotificationSettings()
  const threshold =
    notificationSettings?.smartFailureThreshold ??
    DEFAULT_SMART_FAILURE_THRESHOLD

  const assessed = (report?.disks ?? []).map((disk) => ({
    disk,
    assessment: assessSmart(disk, threshold),
  }))
  const problems = assessed.filter(
    ({ assessment }) => assessment.level !== 'ok',
  )
  const critical = problems.filter(
    ({ assessment }) => assessment.level === 'critical',
  )
  const warnings = problems.filter(
    ({ assessment }) => assessment.level === 'warning',
  )

  // Until a disk is picked, show the one that needs attention, that is where the details are
  const selected =
    assessed.find(({ disk }) => diskKey(disk) === selectedKey) ??
    critical[0] ??
    warnings[0] ??
    assessed.find(({ disk }) => hasAttributeProblem(disk)) ??
    assessed.find(({ disk }) => (disk.attributes ?? []).length > 0) ??
    assessed[0]

  const showDetails = (disk: SmartDiskInfo) => {
    setSelectedKey(diskKey(disk))
    document
      .getElementById(DETAILS_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {loading && (
        <Alert>
          <AlertDescription>{m.smart_monitor_loading_hint()}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <OctagonAlert />
          <AlertTitle>{m.smart_monitor_error()}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {report && report.disks.length > 0 && problems.length === 0 && (
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>
            {m.smart_monitor_all_ok({ count: report.disks.length })}
          </AlertTitle>
          <AlertDescription>{m.smart_monitor_all_ok_hint()}</AlertDescription>
        </Alert>
      )}

      {[
        {
          group: critical,
          variant: 'destructive' as const,
          icon: <OctagonAlert />,
          title: m.smart_monitor_critical_message(),
        },
        {
          group: warnings,
          variant: 'warning' as const,
          icon: <AlertTriangle />,
          title: m.smart_monitor_warning_message(),
        },
      ]
        .filter(({ group }) => group.length > 0)
        .map(({ group, variant, icon, title }) => (
          <Alert key={variant} variant={variant}>
            {icon}
            <AlertTitle className="font-semibold">{title}</AlertTitle>
            <AlertDescription className="text-current">
              <ul className="space-y-1">
                {group.map(({ disk, assessment }) => (
                  <li key={diskKey(disk)}>
                    <a
                      href={`#${DETAILS_ID}`}
                      onClick={(event) => {
                        event.preventDefault()
                        showDetails(disk)
                      }}
                      className="font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      {disk.name}
                    </a>
                    {' · '}
                    {assessment.reasons.map(describeSmartReason).join(', ')}
                  </li>
                ))}
              </ul>
              {smartHints(group.map(({ assessment }) => assessment)).map(
                (hint) => (
                  <p key={hint} className="flex items-start gap-1.5">
                    <Wrench className="mt-1 size-3.5 shrink-0 opacity-70" />
                    {HINT_TEXT[hint]()}
                  </p>
                ),
              )}
            </AlertDescription>
          </Alert>
        ))}

      {report?.arrayFailureProbability !== undefined && (
        <Card className="flex-row items-center gap-4 px-5 py-4">
          {/* Grows with the number of disks, the per-disk threshold does not apply */}
          <div className="shrink-0 whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight">
            {formatPercent(report.arrayFailureProbability, 0)} %
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{m.smart_monitor_array_failure()}</p>
            <p className="text-muted-foreground">
              {m.smart_monitor_array_failure_hint()}
            </p>
          </div>
        </Card>
      )}

      {report && report.disks.length > 0 ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
            {assessed.map(({ disk, assessment }) => (
              <DiskCard
                key={diskKey(disk)}
                disk={disk}
                assessment={assessment}
                threshold={threshold}
                selected={selected?.disk === disk}
                onSelect={() => setSelectedKey(diskKey(disk))}
                selfTest={selfTests.data?.find(
                  (test) => test.disk === disk.name,
                )}
              />
            ))}
          </div>

          {selected && (
            <DiskDetails
              disk={selected.disk}
              history={history?.[selected.disk.name]}
              configPath={configPath}
              selfTests={selfTests}
            />
          )}

          {/* One report for the whole array, like snapraid status on the Integrity page */}
          {report.rawOutput.trim() && (
            <details className="group rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                {m.smart_raw_output()}
              </summary>
              <pre className="max-h-[32rem] overflow-auto border-t bg-muted/50 p-4 font-mono text-xs">
                {report.rawOutput}
              </pre>
            </details>
          )}
        </>
      ) : (
        !loading &&
        !error && (
          <Card className="items-center px-6 py-10 text-center text-sm text-muted-foreground shadow-none">
            {m.smart_monitor_no_disks()}
          </Card>
        )
      )}
    </>
  )
}
