import {
  ATTRIBUTE_INFO,
  attributeInfo,
  temperatureRaw,
} from '@shared/smart-attributes'
import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_TEXT } from '../smart-attributes'

describe('SMART attribute texts', () => {
  it('every attribute in the catalog has a name and an explanation', () => {
    const keys = Object.values(ATTRIBUTE_INFO).map((info) => info.key)
    expect(keys.filter((key) => !ATTRIBUTE_TEXT[key])).toEqual([])
    for (const key of keys) {
      expect(ATTRIBUTE_TEXT[key].name()).not.toBe('')
      expect(ATTRIBUTE_TEXT[key].description().length).toBeGreaterThan(20)
    }
  })

  it('the attributes the health assessment watches are among the important ones', () => {
    for (const id of [5, 187, 197, 198, 199]) {
      expect(ATTRIBUTE_INFO[id]?.important).toBe(true)
    }
  })
})

describe('attributeInfo', () => {
  it('explains an attribute only when its name means what the catalog says', () => {
    expect(
      attributeInfo({ id: 233, name: 'Media_Wearout_Indicator' })?.key,
    ).toBe('media_wearout')
    // SanDisk counts NAND writes on 233
    expect(
      attributeInfo({ id: 233, name: 'Total_NAND_Writes_GiB' }),
    ).toBeUndefined()
    expect(
      attributeInfo({ id: 232, name: 'Perc_Avail_Resrvd_Space' })?.key,
    ).toBe('available_reserve')
    // Ids without a name rule always match
    expect(attributeInfo({ id: 5, name: 'Anything' })?.key).toBe('reallocated')
    expect(attributeInfo({ id: 2, name: 'Throughput_Performance' })).toBe(
      undefined,
    )
  })
})

describe('temperatureRaw', () => {
  it('unpacks the current, lowest and highest temperature', () => {
    // 0x4B00140021
    expect(temperatureRaw('322123857953')).toEqual({
      current: 33,
      min: 20,
      max: 75,
    })
    expect(temperatureRaw('36')).toEqual({ current: 36 })
    // smartctl's own text form starts with the reading
    expect(temperatureRaw('41 (Min/Max 20/52)')).toEqual({ current: 41 })
    expect(temperatureRaw('')).toBeUndefined()
  })

  it('leaves out min and max that do not fit the reading', () => {
    // Only the lowest byte is the temperature here, the rest is something else
    expect(temperatureRaw(String(0x0500000028))).toEqual({ current: 40 })
  })
})
