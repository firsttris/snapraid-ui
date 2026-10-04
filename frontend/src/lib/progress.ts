/**
 * Apply carriage returns like a terminal: text after "\r" replaces the current line
 */
export const renderConsoleOutput = (output: string): string =>
  output
    .split('\n')
    .map((line) => {
      // A trailing "\r" means the line is about to be overwritten, keep what is shown now
      const segments = line.split('\r').filter((segment) => segment !== '')
      return segments.at(-1) ?? ''
    })
    .join('\n')
