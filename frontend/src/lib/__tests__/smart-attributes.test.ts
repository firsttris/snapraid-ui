import { ATTRIBUTE_INFO } from '@shared/smart-attributes'
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
