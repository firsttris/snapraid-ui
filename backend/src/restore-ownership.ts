// SnapRAID keeps no owner or permissions. A file that `fix` brings back from nothing belongs to
// whoever runs SnapRAID, root in the container, with mode 600, and so do the folders it creates
// for it. They take the owner, group and permissions of the folder they are restored into
// instead: the closest folder that existed before, or, on a new disk, the same folder on another
// data disk of the array. Files fixed in place keep theirs, SnapRAID doesn't touch those.
import { dirname, join } from "@std/path";
import { msg } from "@shared/i18n.ts";
import { parseSnapRaidConfig } from "./config-parser.ts";
import { type SnapRaidEngine, wrapJobs } from "./engine/engine.ts";
import { parseLogTags, unescapeTagValue } from "./parsers/structured-log.ts";

export interface RestoredFile {
  disk: string;
  path: string; // Relative to the disk
}

/**
 * The files a fix created again: missing before the run (read error "No such file or
 * directory") and recovered. Changed files repaired in place are not among them.
 */
export const recreatedFiles = (log: string): RestoredFile[] => {
  const missing = new Set<string>();
  const recovered: RestoredFile[] = [];
  for (const { name, values } of parseLogTags(log)) {
    if (name === "error" && values.length >= 4 && values.slice(3).join(":").includes("No such file or directory")) {
      missing.add(`${values[1]}:${values[2]}`);
    } else if (name === "status" && values[0] === "recovered" && values.length >= 3) {
      recovered.push({ disk: values[1], path: values.slice(2).join(":") });
    }
  }
  return recovered
    .filter((file) => missing.has(`${file.disk}:${file.path}`))
    .map((file) => ({ disk: file.disk, path: unescapeTagValue(file.path) }));
};

export interface Ownership {
  uid: number;
  gid: number;
  mode: number; // Permission bits of the folder
}

/**
 * Permissions of a file restored into a folder with these: the folder's read and write bits
 * (755 -> 644, 775 -> 664, 750 -> 640)
 */
export const fileMode = (folderMode: number): number => folderMode & 0o666;

/**
 * Permissions of a folder created for it: the folder's, setgid included so the group carries on
 */
export const folderMode = (folderMode: number): number => folderMode & 0o3777;

const statOrNull = async (path: string): Promise<Deno.FileInfo | null> => {
  try {
    return await Deno.lstat(path);
  } catch {
    return null;
  }
};

const ownershipOf = (info: Deno.FileInfo): Ownership | null =>
  info.uid === null || info.gid === null || info.mode === null ? null : { uid: info.uid, gid: info.gid, mode: info.mode & 0o7777 };

export interface AdoptOptions {
  dataDisks: Record<string, string>; // Name -> mount path, from the config
  startedAt: Date; // Folders made after this were created by the fix
}

export interface AdoptResult {
  files: number; // Files whose owner or permissions were set
  folders: number;
  failed: number;
}

/**
 * Whether a folder was made by the run: its birth time where the filesystem has one,
 * else its change time (a folder that existed but got a file also changes then)
 */
const createdDuringRun = (info: Deno.FileInfo, creator: number | null, options: AdoptOptions): boolean => {
  if (info.uid !== creator) return false;
  // Times may lack the milliseconds, compare by the second
  const since = Math.floor(options.startedAt.getTime() / 1000) * 1000;
  const made = info.birthtime ?? info.ctime;
  return made !== null && made.getTime() >= since;
};

/**
 * The deepest existing folder of the same relative path on another data disk, below its root
 */
const sameFolderElsewhere = async (relativeDir: string, disk: string, options: AdoptOptions): Promise<Ownership | null> => {
  for (let dir = relativeDir; dir !== "." && dir !== "/" && dir !== ""; dir = dirname(dir)) {
    for (const [name, root] of Object.entries(options.dataDisks)) {
      if (name === disk) continue;
      const info = await statOrNull(join(root, dir));
      if (info?.isDirectory) return ownershipOf(info);
    }
  }
  return null;
};

/**
 * Give the files a fix recreated, and the folders it made for them, the owner and permissions
 * of the folder they were restored into. Best effort: a file that is gone or can't be changed
 * (no permission, the disk is not mounted here) is counted and skipped.
 */
export const adoptFolderOwnership = async (files: RestoredFile[], options: AdoptOptions): Promise<AdoptResult> => {
  const result: AdoptResult = { files: 0, folders: 0, failed: 0 };
  const done = new Set<string>();
  const elsewhere = new Map<string, Ownership | null>();

  const apply = async (path: string, wanted: Ownership, mode: number, info: Deno.FileInfo) => {
    if (done.has(path)) return false;
    done.add(path);
    if (info.uid === wanted.uid && info.gid === wanted.gid && ((info.mode ?? 0) & 0o7777) === mode) return false;
    try {
      await Deno.chown(path, wanted.uid, wanted.gid);
      await Deno.chmod(path, mode);
      return true;
    } catch {
      result.failed++;
      return false;
    }
  };

  for (const file of files) {
    const root = options.dataDisks[file.disk];
    if (!root) continue;
    const target = join(root, file.path);
    const info = await statOrNull(target);
    if (!info?.isFile) continue;
    // Whoever ran SnapRAID: the folders it made belong to them too
    const creator = info.uid;

    // Walk up to the first folder that was there before, collecting the ones the fix made
    const created: { path: string; info: Deno.FileInfo }[] = [];
    let source: Ownership | null = null;
    let dir = dirname(target);
    const rootDir = join(root, ".");
    while (dir.startsWith(rootDir) && dir.length > rootDir.length) {
      const dirInfo = await statOrNull(dir);
      if (!dirInfo) break;
      if (!createdDuringRun(dirInfo, creator, options) || done.has(dir)) {
        source = ownershipOf(dirInfo);
        break;
      }
      created.push({ path: dir, info: dirInfo });
      dir = dirname(dir);
    }
    // Up to the root of the disk: on a new disk the same folder on another disk knows better
    if (!source) {
      const relativeDir = dirname(file.path);
      const key = `${file.disk}:${relativeDir}`;
      if (relativeDir !== "." && !elsewhere.has(key)) {
        elsewhere.set(key, await sameFolderElsewhere(relativeDir, file.disk, options));
      }
      const rootInfo = await statOrNull(root);
      source = elsewhere.get(key) ?? (rootInfo ? ownershipOf(rootInfo) : null);
    }
    if (!source) continue;

    for (const folder of created) {
      if (await apply(folder.path, source, folderMode(source.mode), folder.info)) result.folders++;
    }
    if (await apply(target, source, fileMode(source.mode), info)) result.files++;
  }
  return result;
};

/**
 * The engine with every fix followed by `adoptFolderOwnership` for the files it recreated,
 * while the job still counts as running; whatever started the fix (recover files, restore all
 * deleted, the disk replacement, a repair) gets it alike
 */
export const withRestoredOwnership = (engine: SnapRaidEngine): SnapRaidEngine =>
  wrapJobs(engine, (request, run) => {
    if (request.command !== "fix") return run(request);
    const startedAt = new Date();
    return run({
      ...request,
      afterRun: async (outcome) => {
        try {
          const files = recreatedFiles(outcome.report.log);
          if (files.length > 0) {
            const { data } = await parseSnapRaidConfig(request.configPath);
            const result = await adoptFolderOwnership(files, { dataDisks: data, startedAt });
            if (result.files > 0 || result.failed > 0) {
              request.onOutput?.(`${msg("server_restore_ownership", { files: result.files, folders: result.folders })}\n`);
            }
            if (result.failed > 0) {
              request.onOutput?.(`${msg("server_restore_ownership_failed", { count: result.failed })}\n`);
            }
          }
        } catch (error) {
          console.error("Taking over the owner of restored files failed:", error);
        }
        await request.afterRun?.(outcome);
      },
    });
  });
