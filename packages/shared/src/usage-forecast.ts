// When a disk runs full if it keeps filling like it did lately
import type { UsagePoint } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
// Recent growth counts, an old burst says little about today
const WINDOW_DAYS = 90;
// Below this span a few copied files would look like a trend
const MIN_SPAN_DAYS = 14;

export interface FillForecast {
  gbPerMonth: number; // Growth of the used space, negative when it shrinks
  daysUntilFull?: number; // Only while it grows
}

/**
 * Linear trend of the free space over the last 90 days of points
 */
export const forecastFill = (points: Array<{ date: string; freeGB: number }>): FillForecast | undefined => {
  if (points.length < 2) return undefined;
  const last = Date.parse(points[points.length - 1].date);
  const recent = points
    .map((point) => ({ x: (Date.parse(point.date) - last) / DAY_MS, y: point.freeGB }))
    .filter((point) => point.x >= -WINDOW_DAYS);
  if (recent.length < 2 || -recent[0].x < MIN_SPAN_DAYS) return undefined;

  const meanX = recent.reduce((sum, p) => sum + p.x, 0) / recent.length;
  const meanY = recent.reduce((sum, p) => sum + p.y, 0) / recent.length;
  const sxx = recent.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  const sxy = recent.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const slope = sxy / sxx; // free GB per day
  const currentFree = points[points.length - 1].freeGB;

  return {
    gbPerMonth: -slope * 30,
    daysUntilFull: slope < 0 ? Math.max(0, Math.round(currentFree / -slope)) : undefined,
  };
};

/**
 * Free space of one disk over time, from the array points
 */
export const diskFreeSeries = (points: UsagePoint[], disk: string) =>
  points.flatMap((point) => {
    const usage = point.disks[disk];
    return usage ? [{ date: point.date, freeGB: usage.freeGB }] : [];
  });
