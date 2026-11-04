import { describe, expect, it } from 'vitest'
import {
  sparklinePoints,
  TREND_DAYS,
  temperatureSeries,
  temperatureTone,
} from '../temperatureTrend'

describe('temperature trend', () => {
  it('rates the temperature', () => {
    expect(temperatureTone(38)).toBe('ok')
    expect(temperatureTone(46)).toBe('warm')
    expect(temperatureTone(52)).toBe('hot')
  })

  it('takes the last month, without days SMART reported no temperature', () => {
    const points = Array.from({ length: 40 }, (_, day) => ({
      date: `2026-09-${day}`,
      temperature: day === 35 ? undefined : 30 + (day % 5),
    }))
    const series = temperatureSeries(points)
    expect(series).toHaveLength(TREND_DAYS - 1)
    expect(series[0]).toBe(30)
  })

  it('draws the lowest value at the bottom and the highest at the top', () => {
    expect(sparklinePoints([30, 40], 50, 20, 0)).toBe('0.0,20.0 50.0,0.0')
    expect(sparklinePoints([35, 35, 35], 50, 20, 0)).toBe(
      '0.0,10.0 25.0,10.0 50.0,10.0',
    )
    expect(sparklinePoints([35], 50, 20)).toBe('')
  })
})
