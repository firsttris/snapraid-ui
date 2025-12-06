/**
 * Check if line should be skipped
 */
export const shouldSkipLine = (line: string, prefixes: string[]): boolean => {
  const trimmed = line.trim();
  return !trimmed || prefixes.some(prefix => trimmed.startsWith(prefix));
};
