import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyLogLine, parseLog } from '../log-parse'

const fixture = (name: string) =>
  readFileSync(
    new URL(
      `../../../../backend/src/parsers/__tests__/fixtures/${name}`,
      import.meta.url,
    ),
    'utf8',
  )

describe('parseLog', () => {
  it('reads header, exit and summary of a check', () => {
    const log = parseLog(fixture('check.log'))
    expect(log.version).toBe('14.9')
    expect(log.configPath).toBe('snapraid.conf')
    expect(log.exit).toBe('recoverable')
    expect(log.args).toContain('check')
    expect(log.aborted).toBe(false)
    expect(log.blockErrors).toHaveLength(20)
    expect(log.blockErrors[0]).toEqual({
      disk: 'd1',
      file: 'a.bin',
      text: 'Data error at position 1, diff hash bits 66/128',
    })
  })

  it('sorts messages by level, WARNING! is a warning on any channel', () => {
    const log = parseLog(fixture('check.log'))
    expect(log.messages.map((msg) => [msg.level, msg.text])).toEqual([
      ['error', "Missing file '/mnt/array/d1/c-copy.dat'."],
      ['warning', 'WARNING! There are soft errors!'],
      ['fatal', 'DANGER! Unexpected silent data errors!'],
    ])
    expect(log.messages[0].line).toBe(77)
  })

  it('joins messages SnapRAID wrote in parts', () => {
    const log = parseLog(
      "msg:error: WARNING! UUID is unsupported for disks: 'd1'msg:error: , 'd2'msg:error: . Not using inodes.",
    )
    expect(log.messages).toEqual([
      {
        level: 'warning',
        text: "WARNING! UUID is unsupported for disks: 'd1', 'd2'. Not using inodes.",
        line: 1,
      },
    ])
  })

  it('collects the human readable report', () => {
    const log = parseLog(fixture('diff.log'))
    expect(log.report).toContain('1 added')
    expect(log.report).toContain('There are differences!')
    expect(log.summary.get('added')).toBe('1')
  })

  it('notices an abort', () => {
    expect(parseLog('command:sync\nsigint:\n').aborted).toBe(true)
  })
})

describe('classifyLogLine', () => {
  it('colors by tag and message level', () => {
    expect(classifyLogLine('msg:fatal_hardware: DANGER!')).toBe('fatal')
    expect(classifyLogLine('msg:error: WARNING! x')).toBe('warning')
    expect(classifyLogLine('error:1:d1:a.bin: Data error')).toBe('error')
    expect(classifyLogLine('msg:status: Everything OK')).toBe('status')
    expect(classifyLogLine('summary:exit:ok')).toBe('summary')
    expect(classifyLogLine('resolve:proc:0:43: not found')).toBe('noise')
    expect(classifyLogLine('msg:progress: Self-test...')).toBe('noise')
    expect(classifyLogLine('blocksize:65536')).toBe('default')
  })
})
