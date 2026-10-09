// Disks that do not look like the ones SnapRAID recorded in the content file.
// An unmounted disk leaves an empty mount point behind; SnapRAID then sees all its
// files as deleted, and a sync would drop them from parity.
import type { DiskIssue } from "@shared/types.ts";
import { parseLogTags, toInt, unescapeTagValue } from "./parsers/structured-log.ts";

// Parity levels in the structured log, split parity files (`parity/1`) are not tag lines
const PARITY_LEVEL = /^(?:[2-6]-)?parity(?:\/\d+)?$|^z-parity(?:\/\d+)?$/;

// Left behind by mkfs on the mount point's own filesystem, not by the disk's
const IGNORED_ENTRIES = new Set(["lost+found"]);

export type PathState = "missing" | "empty" | "present";

/**
 * What is at a path: nothing, an empty directory, or anything else.
 * Unreadable paths count as present, they are not the problem this check is about.
 */
export const inspectPath = async (path: string): Promise<PathState> => {
  try {
    const info = await Deno.stat(path);
    if (!info.isDirectory) return "present";
    for await (const entry of Deno.readDir(path)) {
      if (!IGNORED_ENTRIES.has(entry.name)) return "present";
    }
    return "empty";
  } catch (error) {
    return error instanceof Deno.errors.NotFound ? "missing" : "present";
  }
};

interface RecordedDisk {
  name: string;
  type: "data" | "parity";
  path: string;
  uuid: string;        // Filesystem the path is on now, empty when unknown
  storedUuid: string;  // Filesystem the content file recorded, empty when unknown
  files: number;       // data: files the content file lists
  storedSize: number;  // parity: size the content file recorded
}

/**
 * Disks of the config next to what the content file recorded for them, from the
 * structured log of `status`: `data:<name>:<dir>:<uuid>`, `<level>:<path>:<uuid>`,
 * `content_data_split:<name>:<uuid>`, `content_parity_split:<level>:<uuid>:<path>:<size>`
 * and `summary:disk_file_count:<name>:<count>`
 */
export const parseRecordedDisks = (log: string): RecordedDisk[] => {
  const tags = parseLogTags(log);
  const disks = new Map<string, RecordedDisk>();
  const disk = (name: string, type: RecordedDisk["type"]): RecordedDisk => {
    const key = `${type}:${name}`;
    const existing = disks.get(key);
    if (existing) return existing;
    const created = { name, type, path: "", uuid: "", storedUuid: "", files: 0, storedSize: 0 };
    disks.set(key, created);
    return created;
  };

  tags.forEach(({ name, values }) => {
    if (name === "data" && values.length >= 2) {
      const entry = disk(values[0], "data");
      entry.path = unescapeTagValue(values[1]);
      entry.uuid = values[2] ?? "";
    } else if (PARITY_LEVEL.test(name) && values.length >= 1) {
      const entry = disk(name, "parity");
      entry.path = unescapeTagValue(values[0]);
      entry.uuid = values[1] ?? "";
    } else if (name === "content_data_split" && values.length >= 1) {
      disk(values[0], "data").storedUuid = values[1] ?? "";
    } else if (name === "content_parity_split" && values.length >= 4) {
      const entry = disk(values[0], "parity");
      entry.storedUuid = values[1];
      // The configured path wins, the stored one stands in for split parity files
      entry.path ||= unescapeTagValue(values[2]);
      entry.storedSize = toInt(values[3]);
    } else if (name === "summary" && values[0] === "disk_file_count" && values.length >= 3) {
      disk(values[1], "data").files = toInt(values[2]);
    }
  });

  return [...disks.values()].filter((entry) => entry.path);
};

/**
 * Disks of a `status` log that are missing, empty or on another filesystem than recorded
 */
export const findDiskIssues = async (
  log: string,
  inspect: (path: string) => Promise<PathState> = inspectPath,
): Promise<DiskIssue[]> => {
  const issues = await Promise.all(parseRecordedDisks(log).map(async (disk): Promise<DiskIssue | null> => {
    const base = { disk: disk.name, type: disk.type, path: disk.path };
    // Only what the content file knows about can be missing; a new disk or parity is fine
    const recorded = disk.type === "data" ? disk.files > 0 : disk.storedSize > 0;
    if (recorded) {
      const state = await inspect(disk.path);
      if (state === "missing") return { ...base, kind: "missing" };
      if (state === "empty" && disk.type === "data") return { ...base, kind: "empty", files: disk.files };
    }
    if (disk.uuid && disk.storedUuid && disk.uuid !== disk.storedUuid) return { ...base, kind: "uuid_changed" };
    return null;
  }));
  return issues.filter((issue): issue is DiskIssue => issue !== null);
};

/**
 * Issues that stop scheduled jobs: the disk is not there. A changed filesystem is
 * expected after replacing a disk, and the next sync records the new one.
 */
export const blockingIssues = (issues: DiskIssue[]): DiskIssue[] =>
  issues.filter((issue) => issue.kind !== "uuid_changed");
