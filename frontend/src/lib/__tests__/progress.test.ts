import { describe, expect, it } from 'vitest'
import { renderConsoleOutput } from '../progress'

describe('renderConsoleOutput', () => {
  it('keeps only the last version of a rewritten line', () => {
    expect(
      renderConsoleOutput('Syncing...\n1%, 5 MB\r2%, 9 MB\r\nDone\n'),
    ).toBe('Syncing...\n2%, 9 MB\nDone\n')
  })

  it('leaves plain output untouched', () => {
    expect(renderConsoleOutput('a\nb\n')).toBe('a\nb\n')
  })
})
