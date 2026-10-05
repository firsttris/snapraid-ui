import type { UsagePoint } from '@shared/types'
import { forecastFill } from '@shared/usage-forecast'
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
import { formatGB } from '../lib/utils'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

const LINE_COLOR = 'rgb(59, 130, 246)'

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

// A trend needs at least two days to compare
export const hasUsageHistory = (
  points: UsagePoint[] | undefined,
): points is UsagePoint[] => !!points && points.length >= 2

/**
 * Protected data over time, renders nothing until there is a trend to show
 */
export const UsageHistoryChart = ({
  points,
}: {
  points: UsagePoint[] | undefined
}) => {
  if (!hasUsageHistory(points)) return null

  const forecast = forecastFill(points)
  const themeColor = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const gridColor = themeColor('--color-gray-200')
  const tickColor = themeColor('--color-gray-500')

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        {m.usage_history_title({ days: String(points.length) })}
        {forecast && (
          <>
            {' · '}
            {forecast.gbPerMonth >= 0
              ? m.usage_history_growth({
                  size: formatGB(forecast.gbPerMonth),
                })
              : m.usage_history_shrink({
                  size: formatGB(-forecast.gbPerMonth),
                })}
          </>
        )}
      </p>
      <div className="h-56">
        <Line
          aria-label={m.usage_history_protected()}
          data={{
            labels: points.map((point) => formatDate(point.date)),
            datasets: [
              {
                data: points.map((point) => point.usedGB),
                borderColor: LINE_COLOR,
                backgroundColor: LINE_COLOR,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 12,
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
                    `${m.usage_history_protected()}: ${formatGB(item.parsed.y ?? 0)}`,
                },
              },
            },
            scales: {
              y: {
                ticks: {
                  color: tickColor,
                  maxTicksLimit: 4,
                  callback: (value: string | number) => formatGB(Number(value)),
                },
                grid: { color: gridColor },
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: tickColor,
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 6,
                },
              },
            },
          }}
        />
      </div>
    </div>
  )
}
