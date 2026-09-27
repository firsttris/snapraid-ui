/**
 * Helpers for SnapRAID structured log output (`--log ">&2"`).
 *
 * Every tag is a single line in the form `NAME:VALUE:VALUE...`.
 * Paths inside tags are escaped: `\d` -> `:`, `\n`, `\r`, `\\`.
 * See doc/snapraid_log.txt in the SnapRAID sources (available since SnapRAID 14.0).
 */

/**
 * Arguments that make SnapRAID write its structured log to stderr,
 * keeping the human readable report on stdout.
 */
export const STRUCTURED_LOG_ARGS = ["--log", ">&2"];

export interface LogTag {
  name: string;
  /** Raw (still escaped) values after the tag name */
  values: string[];
}

/** A tag line starts with a lowercase identifier directly followed by a colon */
const TAG_LINE = /^[a-z0-9][a-z0-9_-]*:/;

/**
 * Unescape a value from a structured log tag
 */
export const unescapeTagValue = (value: string): string =>
  value.replace(/\\(.)/g, (match, char: string) => {
    switch (char) {
      case 'd': return ':';
      case 'n': return '\n';
      case 'r': return '\r';
      case '\\': return '\\';
      default: return match;
    }
  });

/**
 * Check if a line is a structured log tag
 */
export const isTagLine = (line: string): boolean => TAG_LINE.test(line);

/**
 * Parse all tag lines of an output. Non-tag lines are ignored.
 */
export const parseLogTags = (output: string): LogTag[] =>
  output.split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(isTagLine)
    .map(line => {
      const [name, ...values] = line.split(':');
      return { name, values };
    });

/**
 * Join the values from `index` on, for trailing free-text values that may contain colons (e.g. messages)
 */
export const restOf = (values: string[], index: number): string => values.slice(index).join(':').trim();

/**
 * Parse an integer value, returning `fallback` when missing or invalid
 */
export const toInt = (value: string | undefined, fallback = 0): number => {
  const parsed = parseInt(value ?? '', 10);
  return isNaN(parsed) ? fallback : parsed;
};

/**
 * Collect `name:key:value` tags (e.g. `summary:file_count:22`) into a map of key -> value
 */
export const collectKeyValues = (tags: LogTag[], name: string): Map<string, string> =>
  new Map(
    tags
      .filter(tag => tag.name === name && tag.values.length >= 2)
      .map(tag => [tag.values[0], tag.values.slice(1).join(':')])
  );

/**
 * Split captured output into the structured log and the human readable remainder
 */
export const splitStructuredOutput = (output: string): { log: string, text: string } => {
  const lines = output.split('\n');
  return {
    log: lines.filter(isTagLine).join('\n'),
    text: lines.filter(line => !isTagLine(line)).join('\n'),
  };
};
