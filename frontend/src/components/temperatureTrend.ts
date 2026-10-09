import type { SmartHistoryPoint } from '@shared/types'

// About a month of daily SMART reads
export const TREND_DAYS = 30

export type TemperatureTone = 'ok' | 'warm' | 'hot'

// Most hard disks are rated up to 55-60 °C, above 45 °C they age faster
export const temperatureTone = (celsius: number): TemperatureTone =>
  celsius >= 50 ? 'hot' : celsius >= 45 ? 'warm' : 'ok'

export const temperatureSeries = (points: SmartHistoryPoint[] | undefined) =>
  (points ?? [])
    .slice(-TREND_DAYS)
    .map((point) => point.temperature)
    .filter((value): value is number => typeof value === 'number')

/**
 * SVG polyline points for the values, oldest left; a flat line in the middle when they do not change
 */
export const sparklinePoints = (
  values: number[],
  width: number,
  height: number,
  padding = 1.5,
): string => {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const step = (width - padding * 2) / (values.length - 1)
  return values
    .map((value, index) => {
      const x = padding + index * step
      const y =
        max === min
          ? height / 2
          : padding + (1 - (value - min) / (max - min)) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
