import { join, dirname } from "@std/path";

/**
 * Resolve file path: try absolute first, then relative to project root
 */
export const resolvePath = async (path: string): Promise<string> => {
  const absPath = path;
  const projectRoot = dirname(Deno.cwd());
  const relPath = join(projectRoot, path.startsWith('/') ? path.slice(1) : path);
  
  try {
    await Deno.stat(absPath);
    return absPath;
  } catch {
    return relPath;
  }
};