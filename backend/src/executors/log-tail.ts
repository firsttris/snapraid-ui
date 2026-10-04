/**
 * Reads the lines a running process appends to its log file, from where the last read stopped.
 * A line still being written is kept until it is complete.
 */
export const createLogTail = (path: string) => {
  let offset = 0;
  let partial = "";
  const decoder = new TextDecoder();

  return async (): Promise<string> => {
    let file: Deno.FsFile;
    try {
      file = await Deno.open(path, { read: true });
    } catch {
      return ""; // Not created yet
    }
    try {
      await file.seek(offset, Deno.SeekMode.Start);
      const chunks: string[] = [];
      const buffer = new Uint8Array(64 * 1024);
      while (true) {
        const read = await file.read(buffer);
        if (read === null || read === 0) break;
        offset += read;
        chunks.push(decoder.decode(buffer.subarray(0, read), { stream: true }));
      }
      const text = partial + chunks.join("");
      const end = text.lastIndexOf("\n") + 1;
      partial = text.slice(end);
      return text.slice(0, end);
    } finally {
      file.close();
    }
  };
};
