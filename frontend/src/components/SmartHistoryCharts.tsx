import type { SmartHistoryPoint } from '@shared/types'
import {
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type TooltipItem,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useTheme } from '../lib/theme'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

type Metric = Exclude<keyof SmartHistoryPoint, 'date'>

// Blue 500 of the palette, a mid tone that reads on light and dark cards
const LINE_COLOR = 'rgb(59, 130, 246)'

const METRICS: Array<{ key: Metric; label: () => string; unit: string }> = [
  { key: 'temperature', label: m.smart_history_temperature, unit: ' °C' },
  { key: 'reallocated', label: m.smart_history_reallocated, unit: '' },
  { key: 'pending', label: m.smart_history_pending, unit: '' },
  { key: 'crc', label: m.smart_history_crc, unit: '' },
  { key: 'mediaErrors', label: m.smart_history_media_errors, unit: '' },
  { key: 'wear', label: m.smart_history_wear, unit: ' %' },
]

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
  })

// One small chart per value, each with its own scale; counters only once they count something
const MetricChart = ({
  points,
  metric,
  label,
  unit,
}: {
  points: SmartHistoryPoint[]
  metric: Metric
  label: string
  unit: string
}) => {
  // Re-renders on a theme switch, so the axes pick up the new token values
  useTheme()
  const themeColor = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const gridColor = themeColor('--border')
  const tickColor = themeColor('--muted-foreground')
  const values = points.map((point) => point[metric] ?? null)
  const latest = values.filter((value) => value !== null).at(-1)

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {label}{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {latest?.toLocaleString(getLocale())}
          {unit}
        </span>
      </p>
      <div className="h-24">
        <Line
          data={{
            labels: points.map((point) => formatDate(point.date)),
            datasets: [
              {
                data: values,
                borderColor: LINE_COLOR,
                backgroundColor: LINE_COLOR,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 12,
                spanGaps: true,
                stepped: metric !== 'temperature',
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item: TooltipItem<'line'>) =>
                    `${item.parsed.y?.toLocaleString(getLocale())}${unit}`,
                },
              },
            },
            scales: {
              y: {
                ticks: { color: tickColor, maxTicksLimit: 3, precision: 0 },
                grid: { color: gridColor },
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: tickColor,
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 4,
                },
              },
            },
          }}
        />
      </div>
    </div>
  )
}

const shownMetrics = (points: SmartHistoryPoint[] | undefined) =>
  !points || points.length < 2
    ? []
    : METRICS.filter(({ key }) =>
        key === 'temperature'
          ? points.some((point) => point.temperature !== undefined)
          : points.some((point) => (point[key] ?? 0) > 0),
      )

/**
 * Whether there is a history worth a chart: at least two days and a value to show
 */
export const hasSmartHistory = (points: SmartHistoryPoint[] | undefined) =>
  shownMetrics(points).length > 0

/**
 * Daily SMART values of a disk, hidden until there are at least two days to compare
 */
export const SmartHistoryCharts = ({
  points,
}: {
  points: SmartHistoryPoint[] | undefined
}) => {
  const shown = shownMetrics(points)
  if (!points || shown.length === 0) return null

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {shown.map(({ key, label, unit }) => (
        <MetricChart
          key={key}
          points={points}
          metric={key}
          label={label()}
          unit={unit}
        />
      ))}
    </div>
  )
}
