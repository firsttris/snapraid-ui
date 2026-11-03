/**
 * Reads a SnapRAID structured log (`-l`) for the log viewer.
 * Tags are `name:value:value...` lines, see doc/snapraid_log.txt in the SnapRAID sources.
 */

export type LogMessageLevel = 'fatal' | 'error' | 'warning'

export interface LogMessage {
  level: LogMessageLevel
  text: string
  line: number // 1-based line in the log
}

export interface LogBlockError {
  disk: string
  file: string
  text: string
}

export interface ParsedLog {
  version?: string
  startedAt?: string // ISO string
  configPath?: string
  args: string[]
  exit?: string
  aborted: boolean
  // The human readable report SnapRAID prints, e.g. the status table
  report: string
  messages: LogMessage[]
  blockErrors: LogBlockError[]
  summary: Map<string, string>
  lineCount: number
}

// `\d` stands for a colon inside a value
const unescapeValue = (value: string) =>
  value.replace(/\\(.)/g, (match, char: string) => {
    switch (char) {
      case 'd':
        return ':'
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case '\\':
        return '\\'
      default:
        return match
    }
  })

// SnapRAID flushes a message in parts, each part repeats the tag on the same line
const MESSAGE_PART = /msg:([a-z_]+):/g

const splitMessageLine = (line: string) => {
  const parts: Array<{ level: string; text: string }> = []
  const matches = [...line.matchAll(MESSAGE_PART)]
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[i + 1]?.index ?? line.length
    // One space separates the tag from the text
    parts.push({
      level: match[1],
      text: line.slice(start, end).replace(/^ /, ''),
    })
  })
  return parts
}

const messageLevel = (level: string, text: string): LogMessageLevel | null => {
  if (level !== 'error' && !level.startsWith('fatal')) return null
  // SnapRAID prints its warnings on the error and fatal channels
  if (/^\s*WARNING!/.test(text)) return 'warning'
  return level === 'error' ? 'error' : 'fatal'
}

export const parseLog = (content: string): ParsedLog => {
  const lines = content.split('\n')
  const result: ParsedLog = {
    args: [],
    aborted: false,
    report: '',
    messages: [],
    blockErrors: [],
    summary: new Map(),
    lineCount: lines.length,
  }
  const report: string[] = []

  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const colon = line.indexOf(':')
    if (colon < 0) return
    const tag = line.slice(0, colon)
    const rest = line.slice(colon + 1)

    switch (tag) {
      case 'version':
        result.version = rest
        break
      case 'unixtime':
        result.startedAt = new Date(Number(rest) * 1000).toISOString()
        break
      case 'argv': {
        const [position, ...value] = rest.split(':')
        // argv:0 is the binary itself
        if (position !== '0') result.args.push(unescapeValue(value.join(':')))
        break
      }
      case 'conf':
        if (rest.startsWith('file:'))
          result.configPath = unescapeValue(rest.slice(5))
        break
      case 'sigint':
        result.aborted = true
        break
      case 'summary': {
        const [key, ...value] = rest.split(':')
        if (key === 'exit') result.exit = value[0]
        // Per disk values have a disk name in between, only the totals are kept
        else if (value.length === 1) result.summary.set(key, value[0])
        break
      }
      case 'error': {
        // error:<block>:<disk>:<file>: <text>
        const [, disk, file, ...text] = rest.split(':')
        if (disk && file !== undefined) {
          result.blockErrors.push({
            disk,
            file: unescapeValue(file),
            text: text.join(':').trim(),
          })
        }
        break
      }
      case 'msg': {
        const parts = splitMessageLine(line)
        const status = parts
          .filter((part) => part.level === 'status')
          .map((part) => part.text)
        if (status.length > 0) report.push(status.join(''))

        const problem = parts.filter((part) =>
          messageLevel(part.level, part.text),
        )
        if (problem.length > 0) {
          const text = problem
            .map((part) => part.text)
            .join('')
            .trim()
          const level = messageLevel(problem[0].level, text)
          if (level && text) {
            result.messages.push({ level, text, line: index + 1 })
          }
        }
        break
      }
    }
  })

  result.report = report.join('\n').replace(/^\n+|\n+$/g, '')
  return result
}

export type LogLineKind =
  | 'fatal'
  | 'error'
  | 'warning'
  | 'status'
  | 'summary'
  | 'noise'
  | 'default'

// Tags that only matter when debugging SnapRAID itself
const NOISE_TAGS = new Set([
  'resolve',
  'memory',
  'scrub_graph_bar',
  'scrub_graph_range',
  'bucket',
  'content_data_split',
  'content_parity_split',
  'fsinfo_data_split',
  'fsinfo_parity_split',
  'attr',
  'msg:progress',
  'msg:verbose',
])

/**
 * Coloring of a raw log line
 */
export const classifyLogLine = (line: string): LogLineKind => {
  const tag = line.slice(0, line.indexOf(':'))
  if (tag === 'msg') {
    const level = line.match(/^msg:([a-z_]+):/)?.[1] ?? ''
    const text = line.slice(level.length + 5)
    const problem = messageLevel(level, text)
    if (problem) return problem
    if (level === 'status') return 'status'
    return NOISE_TAGS.has(`msg:${level}`) ? 'noise' : 'default'
  }
  if (tag === 'error' || tag === 'sigint') return 'error'
  if (tag === 'summary') return 'summary'
  if (NOISE_TAGS.has(tag)) return 'noise'
  return 'default'
}
