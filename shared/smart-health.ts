// Assessment of a disk's SMART data, shared by the SMART page and the notifications
import type { SmartAttribute, SmartDiskInfo } from "./types.ts";

export type SmartLevel = "ok" | "warning" | "critical";

export type SmartReason =
  | { kind: "status"; status: SmartDiskInfo["status"] }
  | { kind: "unreadable" }
  | { kind: "failure_probability"; percent: number }
  | { kind: "sectors"; attribute: SectorAttribute; count: number }
  | { kind: "errors"; attribute: ErrorAttribute; count: number }
  | { kind: "wear"; percent: number }
  | { kind: "temperature"; celsius: number };

export type SectorAttribute = "reallocated" | "pending" | "uncorrectable";
export type ErrorAttribute = "reported_uncorrectable" | "crc" | "medium";

export interface SmartAssessment {
  level: SmartLevel;
  reasons: SmartReason[];
}

// What to do about the reasons: replace the disk, check its cable, cool it, or give SnapRAID access to it
export type SmartHint = "replace" | "cable" | "cooling" | "access";

// SnapRAID's failure model gives healthy disks a few percent per year, so the default warns well above that
export const DEFAULT_SMART_FAILURE_THRESHOLD = 25;
export const CRITICAL_FAILURE_PROBABILITY = 50;
export const HOT_CELSIUS = 50;
export const CRITICAL_CELSIUS = 60;
// SSD lifetime used; past 100 % the rated endurance is exceeded
export const WORN_PERCENT = 80;
export const CRITICAL_WEAR_PERCENT = 100;

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

export const CRC_ATTRIBUTE_ID = 199;

const ERROR_ATTRIBUTES: Record<number, ErrorAttribute> = {
  187: "reported_uncorrectable", // Read errors the disk could not correct with ECC
  199: "crc",                    // Transfer errors, a cable or backplane problem rather than the disk
};

const rawCount = (raw: string): number => {
  const count = parseInt(raw, 10);
  return Number.isNaN(count) ? 0 : count;
};

// Transfer errors that stopped growing are a past cable problem, nothing to watch
const isStableCrc = (attribute: SmartAttribute, disk?: SmartDiskInfo) =>
  attribute.id === CRC_ATTRIBUTE_ID && disk?.crcStableSince !== undefined;

/**
 * How alarming a single attribute is, to highlight it in the attribute table
 */
export const attributeLevel = (attribute: SmartAttribute, disk?: SmartDiskInfo): SmartLevel => {
  if (attribute.whenFailed === "now") return "critical";
  if (attribute.whenFailed === "past") return "warning";
  if (isStableCrc(attribute, disk)) return "ok";
  const watched = SECTOR_ATTRIBUTES[attribute.id] ?? ERROR_ATTRIBUTES[attribute.id];
  return watched && rawCount(attribute.raw) > 0 ? "warning" : "ok";
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

  // smartctl could not read the disk, it is not monitored; a sleeping disk is fine
  if (disk.status === "UNKNOWN" && !disk.standby) found.push({ level: "warning", reason: { kind: "unreadable" } });

  (disk.attributes ?? []).forEach((attribute) => {
    const count = rawCount(attribute.raw);
    if (count === 0 || isStableCrc(attribute, disk)) return;
    const sector = SECTOR_ATTRIBUTES[attribute.id];
    if (sector) found.push({ level: "warning", reason: { kind: "sectors", attribute: sector, count } });
    const error = ERROR_ATTRIBUTES[attribute.id];
    if (error) found.push({ level: "warning", reason: { kind: "errors", attribute: error, count } });
  });

  if (disk.errorMedium) {
    found.push({ level: "warning", reason: { kind: "errors", attribute: "medium", count: disk.errorMedium } });
  }

  if (disk.wearLevel !== undefined && disk.wearLevel >= WORN_PERCENT) {
    found.push({
      level: disk.wearLevel >= CRITICAL_WEAR_PERCENT ? "critical" : "warning",
      reason: { kind: "wear", percent: disk.wearLevel },
    });
  }

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

const hintFor = (reason: SmartReason): SmartHint => {
  switch (reason.kind) {
    case "unreadable":
      return "access";
    case "temperature":
      return "cooling";
    case "errors":
      return reason.attribute === "crc" ? "cable" : "replace";
    case "status":
      // The error log fills up from loose cables and power losses as well
      return reason.status === "LOGERR" ? "cable" : "replace";
    default:
      return "replace";
  }
};

/**
 * What to do about the problems of one or more disks, most urgent first
 */
export const smartHints = (assessments: SmartAssessment[]): SmartHint[] => {
  const hints = new Set(assessments.flatMap(({ reasons }) => reasons.map(hintFor)));
  return (["replace", "cable", "cooling", "access"] as const).filter((hint) => hints.has(hint));
};

/**
 * Identity of a disk's problems, to notify only when they change.
 * Sector and error counts are part of it, a growing count is news; temperature, probability and wear only by kind, they drift.
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
          case "errors":
            return `${reason.attribute}:${reason.count}`;
          default:
            return reason.kind;
        }
      }),
    ].join("|");
