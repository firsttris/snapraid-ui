import type { SmartHistoryPoint } from '@shared/types'
import * as m from '../paraglide/messages'

// Kept apart from SmartHistoryCharts, so deciding whether to show the history
// tab doesn't load chart.js; the charts themselves are loaded lazily.

export type Metric = Exclude<keyof SmartHistoryPoint, 'date'>

const METRICS: Array<{ key: Metric; label: () => string; unit: string }> = [
  { key: 'temperature', label: m.smart_history_temperature, unit: ' °C' },
  { key: 'reallocated', label: m.smart_history_reallocated, unit: '' },
  { key: 'pending', label: m.smart_history_pending, unit: '' },
  { key: 'crc', label: m.smart_history_crc, unit: '' },
  { key: 'mediaErrors', label: m.smart_history_media_errors, unit: '' },
  { key: 'wear', label: m.smart_history_wear, unit: ' %' },
]

export const shownMetrics = (points: SmartHistoryPoint[] | undefined) =>
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
