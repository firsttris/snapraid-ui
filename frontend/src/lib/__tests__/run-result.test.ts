import { readFileSync } from 'node:fs'
import { parseRunResult } from '@shared/run-result'
import { describe, expect, it } from 'vitest'

const fixture = (name: string) =>
  readFileSync(
    new URL(
      `../../../../backend/src/parsers/__tests__/fixtures/${name}`,
      import.meta.url,
    ),
    'utf8',
  )

// The log viewer reads the result of a log missing from the list with the backend's rules
describe('parseRunResult in the log viewer', () => {
  it('shows finished touch and smart runs as ok, not incomplete', () => {
    expect(parseRunResult(fixture('touch.log'))).toBe('ok')
    expect(parseRunResult(fixture('smart.log'))).toBe('ok')
  })

  it('shows a touch or smart cut short as incomplete', () => {
    const touch = fixture('touch.log')
    const smart = fixture('smart.log')
    expect(
      parseRunResult(
        touch.slice(0, touch.indexOf('content_info:write_unixtime:')),
      ),
    ).toBe('incomplete')
    expect(
      parseRunResult(smart.slice(0, smart.indexOf('summary:array_failure:'))),
    ).toBe('incomplete')
  })

  it('keeps the results of commands that write a summary', () => {
    expect(parseRunResult(fixture('check-ok.log'))).toBe('ok')
    expect(parseRunResult(fixture('check.log'))).toBe('warning')
    expect(parseRunResult(fixture('status-bad.log'))).toBe('error')
    expect(parseRunResult(`${fixture('touch.log')}\nsigint:`)).toBe('aborted')
  })
})
