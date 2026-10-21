// Writes a file in one step: into a temporary file next to it, then renamed over it. Deno.writeTextFile
// truncates first, so a request reading at the same time could get an empty or half-written file;
// with the rename a reader gets the old or the new content
export const writeTextFileAtomic = async (
  path: string,
  content: string,
  options: { mode?: number } = {},
): Promise<void> => {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeTextFile(temp, content, options);
    await Deno.rename(temp, path);
  } catch (error) {
    await Deno.remove(temp).catch(() => {});
    throw error;
  }
};
