import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

/**
 * Reads the lines a running process appends to its log file, from where the last read stopped.
 * A line still being written is kept until it is complete.
 */
export const createLogTail = (path: string) => {
  let offset = 0;
  let partial = "";
  const decoder = new TextDecoder();

  return async (): Promise<string> => {
    let file: FileHandle;
    try {
      file = await open(path, "r");
    } catch {
      return ""; // Not created yet
    }
    try {
      const chunks: string[] = [];
      const buffer = new Uint8Array(64 * 1024);
      while (true) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
        chunks.push(decoder.decode(buffer.subarray(0, bytesRead), { stream: true }));
      }
      const text = partial + chunks.join("");
      const end = text.lastIndexOf("\n") + 1;
      partial = text.slice(end);
      return text.slice(0, end);
    } finally {
      await file.close();
    }
  };
};
