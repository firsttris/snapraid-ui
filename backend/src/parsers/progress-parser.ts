import type { JobProgress } from "@shared/types.ts";
import { parseLogTags, toInt } from "./structured-log.ts";

const MEGA = 1000 * 1000;

/**
 * Latest progress of a running sync, scrub, check or fix, from the `run:pos` tags SnapRAID
 * writes with `--gui`:
 * `run:pos:<blockidx>:<blockdone>:<sizedone>:<perc>:<eta>:<speed_mbs>:<cpu>:<elapsed>:<temp>:<steady_temp>`.
 * ETA, speed and temperature are empty until SnapRAID has enough samples.
 */
export const parseRunPos = (log: string): JobProgress | null => {
  const last = parseLogTags(log).filter((tag) => tag.name === "run" && tag.values[0] === "pos").at(-1);
  if (!last) return null;
  const [, , , sizeDone, percent, eta, speed, , , temperature] = last.values;
  const optional = (value: string | undefined) => (value ? toInt(value) : undefined);
  const etaSeconds = optional(eta);
  return {
    percent: toInt(percent),
    processedMB: Math.floor(toInt(sizeDone) / MEGA),
    speedMBs: optional(speed),
    etaMinutes: etaSeconds === undefined ? undefined : Math.floor(etaSeconds / 60),
    temperature: optional(temperature),
  };
};
