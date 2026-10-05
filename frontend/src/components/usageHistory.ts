import type { UsagePoint } from '@shared/types'

// Kept apart from UsageHistoryChart, so deciding whether to show the history
// tab doesn't load chart.js; the chart itself is loaded lazily.

// A trend needs at least two days to compare
export const hasUsageHistory = (
  points: UsagePoint[] | undefined,
): points is UsagePoint[] => !!points && points.length >= 2
