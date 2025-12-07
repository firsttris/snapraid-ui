import type { LogFile } from "@shared/types";
import { API_BASE } from "./constants";

/**
 * Get all log files
 */
export const getLogs = async (): Promise<LogFile[]> => {
  const response = await fetch(`${API_BASE}/logs`);
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}

/**
 * Get log file content
 */
export const getLogContent = async (filename: string): Promise<string> => {
  const response = await fetch(`${API_BASE}/logs/${encodeURIComponent(filename)}`);
  if (!response.ok) throw new Error('Failed to fetch log content');
  return response.text();
}

/**
 * Delete a log file
 */
export const deleteLog = async (filename: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/logs/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete log');
}

/**
 * Trigger log rotation
 */
export const rotateLogs = async (): Promise<{ deleted: number }> => {
  const response = await fetch(`${API_BASE}/logs/rotate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to rotate logs');
  return response.json();
}
