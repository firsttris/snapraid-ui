import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { msg } from '@shared/i18n'
import { describe, expect, it } from 'vitest'
import { localizeServer } from '../i18n'

const LOCALES = ['en', 'de', 'it']
const read = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<
    string,
    unknown
  >
const messages = Object.fromEntries(LOCALES.map((l) => [l, read(l)]))
const keys = Object.keys(messages.en).filter((k) => k !== '$schema')

/** Placeholders a message uses, over all variants. */
const placeholders = (v: unknown) =>
  [...new Set([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
    .sort()
    .join(',')

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory())
      return ['paraglide', '__tests__'].includes(e.name)
        ? []
        : files(join(dir, e.name))
    return /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []
  })

describe('messages/*.json', () => {
  it('has every message in every language, none empty, with the same placeholders', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(
        Object.keys(messages.en).sort(),
      )
      const empty = keys.filter(
        (k) =>
          typeof messages[locale][k] === 'string' &&
          !(messages[locale][k] as string).trim(),
      )
      expect(empty).toEqual([])
      const differ = keys.filter(
        (k) =>
          placeholders(messages[locale][k]) !== placeholders(messages.en[k]),
      )
      expect(differ).toEqual([])
    }
  })

  it('every message is used, every used key exists', () => {
    const frontend = files('src').map((f) => readFileSync(f, 'utf8'))
    const backend = files('../backend/src').map((f) => readFileSync(f, 'utf8'))
    const code = [...frontend, ...backend].join('\n')
    // m.key() only counts in files that import the messages as m (elsewhere m is often a regex)
    const mCode = frontend
      .filter((s) => /import \* as m from '[./]+paraglide\/messages'/.test(s))
      .join('\n')
    const called = [
      ...[...mCode.matchAll(/\bm\.(\w+)\(/g)].map((m) => m[1]),
      // backend messages: msg("key", …)
      ...[...code.matchAll(/\bmsg\(\s*["'](\w+)["']/g)].map((m) => m[1]),
    ]
    const used = new Set([
      ...called,
      // m.key handed on without calling it (option lists, label maps)
      ...[...mCode.matchAll(/\bm\.(\w+)\b/g)].map((m) => m[1]),
      // keys picked at runtime from a map
      ...[...code.matchAll(/["']([a-z][a-z0-9]*_[a-z0-9_]+)["']/g)].map(
        (m) => m[1],
      ),
    ])
    expect(keys.filter((k) => !used.has(k))).toEqual([])
    expect(called.filter((k) => !(k in messages.en))).toEqual([])
  })
})

describe('localizeServer', () => {
  it('renders backend messages in the UI language and keeps plain text', () => {
    expect(
      localizeServer(msg('server_error_disk_not_found', { disk: 'd1' })),
    ).toBe("Disk 'd1' not found")
    const nested = msg('server_error_invalid_cron', {
      error: msg('server_error_no_job'),
    })
    expect(localizeServer(`x: ${nested}`)).toBe(
      'x: Invalid cron expression: No job is running',
    )
    expect(localizeServer('snapraid: disk full')).toBe('snapraid: disk full')
    expect(localizeServer(msg('no_such_key'))).toBe('no_such_key')
  })
})
