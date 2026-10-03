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
import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

type Metric = Exclude<keyof SmartHistoryPoint, 'date'>

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
  const themeColor = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const gridColor = themeColor('--color-gray-200')
  const tickColor = themeColor('--color-gray-500')
  const values = points.map((point) => point[metric] ?? null)
  const latest = values.filter((value) => value !== null).at(-1)

  return (
    <div>
      <p className="text-xs text-gray-500">
        {label}{' '}
        <span className="font-semibold text-gray-900">
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

/**
 * Daily SMART values of a disk, hidden until there are at least two days to compare
 */
export const SmartHistoryCharts = ({
  points,
}: {
  points: SmartHistoryPoint[] | undefined
}) => {
  const [expanded, setExpanded] = useState(false)
  if (!points || points.length < 2) return null

  const shown = METRICS.filter(({ key }) =>
    key === 'temperature'
      ? points.some((point) => point.temperature !== undefined)
      : points.some((point) => (point[key] ?? 0) > 0),
  )
  if (shown.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        {expanded ? '▼' : '▶'}{' '}
        {m.smart_history_title({ days: String(points.length) })}
      </button>
      {expanded && (
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
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
      )}
    </div>
  )
}
