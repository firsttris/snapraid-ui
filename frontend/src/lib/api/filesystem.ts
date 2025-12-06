import { API_BASE } from "./constants";

/**
 * Browse filesystem for .conf files
 */
export const browseFilesystem = async (path?: string, filter: 'conf' | 'directories' = 'conf'): Promise<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }> => {
  const url = `${API_BASE}/api/filesystem/browse?filter=${filter}${path ? `&path=${encodeURIComponent(path)}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to browse filesystem');
  return response.json();
}

/**
 * Read file content
 */
export const readFile = async (path: string): Promise<string> => {
  const response = await fetch(`${API_BASE}/api/filesystem/read?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error('Failed to read file');
  const result = await response.json();
  return result.content;
}

/**
 * Write file content
 */
export const writeFile = async (path: string, content: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/filesystem/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!response.ok) throw new Error('Failed to write file');
}
