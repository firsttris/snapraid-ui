// Assessment of a disk's SMART data, shared by the SMART page and the notifications
import type { SmartDiskInfo } from "./types.ts";

export type SmartLevel = "ok" | "warning" | "critical";

export type SmartReason =
  | { kind: "status"; status: SmartDiskInfo["status"] }
  | { kind: "failure_probability"; percent: number }
  | { kind: "sectors"; attribute: SectorAttribute; count: number }
  | { kind: "temperature"; celsius: number };

export type SectorAttribute = "reallocated" | "pending" | "uncorrectable";

export interface SmartAssessment {
  level: SmartLevel;
  reasons: SmartReason[];
}

// SnapRAID's failure model gives healthy disks a few percent per year, so the default warns well above that
export const DEFAULT_SMART_FAILURE_THRESHOLD = 25;
const CRITICAL_FAILURE_PROBABILITY = 50;
const HOT_CELSIUS = 50;
const CRITICAL_CELSIUS = 60;

const STATUS_LEVEL: Partial<Record<SmartDiskInfo["status"], SmartLevel>> = {
  FAIL: "critical",     // smartctl reports the disk as failing
  PREFAIL: "critical",  // A pre-failure attribute is below its threshold now
  LOGFAIL: "warning",   // ... was below its threshold in the past
  LOGERR: "warning",    // Errors in the device error log
  SELFERR: "warning",   // A self-test failed
};

// Growing counts of these are the most common early sign of a failing disk
const SECTOR_ATTRIBUTES: Record<number, SectorAttribute> = {
  5: "reallocated",
  197: "pending",
  198: "uncorrectable",
};

const rawCount = (raw: string): number => {
  const count = parseInt(raw, 10);
  return Number.isNaN(count) ? 0 : count;
};

const worst = (levels: SmartLevel[]): SmartLevel =>
  levels.includes("critical") ? "critical" : levels.includes("warning") ? "warning" : "ok";

export const assessSmart = (
  disk: SmartDiskInfo,
  failureThreshold = DEFAULT_SMART_FAILURE_THRESHOLD,
): SmartAssessment => {
  const found: Array<{ level: SmartLevel; reason: SmartReason }> = [];

  const statusLevel = STATUS_LEVEL[disk.status];
  if (statusLevel) found.push({ level: statusLevel, reason: { kind: "status", status: disk.status } });

  (disk.attributes ?? []).forEach((attribute) => {
    const kind = SECTOR_ATTRIBUTES[attribute.id];
    const count = rawCount(attribute.raw);
    if (kind && count > 0) {
      found.push({ level: "warning", reason: { kind: "sectors", attribute: kind, count } });
    }
  });

  const probability = disk.failureProbability;
  if (probability !== undefined && probability >= failureThreshold) {
    found.push({
      level: probability >= CRITICAL_FAILURE_PROBABILITY ? "critical" : "warning",
      reason: { kind: "failure_probability", percent: probability },
    });
  }

  if (disk.temperature !== undefined && disk.temperature > HOT_CELSIUS) {
    found.push({
      level: disk.temperature >= CRITICAL_CELSIUS ? "critical" : "warning",
      reason: { kind: "temperature", celsius: disk.temperature },
    });
  }

  return { level: worst(found.map((f) => f.level)), reasons: found.map((f) => f.reason) };
};

/**
 * Identity of a disk's problems, to notify only when they change.
 * Sector counts are part of it, a growing count is news; temperature and probability only by kind, they drift.
 */
export const smartSignature = ({ level, reasons }: SmartAssessment): string | null =>
  level === "ok"
    ? null
    : [
      level,
      ...reasons.map((reason) => {
        switch (reason.kind) {
          case "status":
            return `status:${reason.status}`;
          case "sectors":
            return `${reason.attribute}:${reason.count}`;
          default:
            return reason.kind;
        }
      }),
    ].join("|");
