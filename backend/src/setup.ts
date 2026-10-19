// Mount points that can become disks of a new array, for the setup wizard. In Docker these are
// the disks mounted into the container, on a host all mounted filesystems.
import { type ArraySetup, buildSnapraidConf, type SetupProblem, setupProblems } from "@shared/array-setup.ts";
import { msg } from "@shared/i18n.ts";
import type { MountCandidate } from "@shared/types.ts";
import { loadAppConfig, saveAppConfig } from "./config-parser.ts";
import { BASE_PATH, resolveFromBase } from "./config.ts";

// Filesystems that never hold data disks
const VIRTUAL_FS = new Set([
  "tmpfs", "devtmpfs", "overlay", "proc", "sysfs", "cgroup", "cgroup2", "mqueue", "devpts", "shm",
  "squashfs", "nsfs", "autofs", "fuse.lxcfs", "efivarfs", "ramfs", "tracefs", "securityfs", "debugfs",
  "pstore", "bpf", "configfs", "fusectl", "hugetlbfs", "binfmt_misc", "rpc_pipefs", "nfsd", "fuse.portal",
]);

// System and app directories, and in Docker the files bind-mounted into the container
const SYSTEM_PREFIXES = ["/proc", "/sys", "/dev", "/run", "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64",
  "/boot", "/var", "/tmp", "/app", "/snap", "/deno-dir", "/root", "/home"];

const isSystemPath = (target: string) =>
  target === "/" || SYSTEM_PREFIXES.some((prefix) => target === prefix || target.startsWith(`${prefix}/`));

export interface DfMount {
  device: string;
  fstype: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  path: string;
}

/**
 * `df -B1 --output=source,fstype,size,used,avail,target`, mount points may contain spaces
 */
export const parseDfMounts = (output: string): DfMount[] =>
  output.trim().split("\n").slice(1).flatMap((line) => {
    const match = line.trim().match(/^(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) return [];
    const [, device, fstype, total, used, free, path] = match;
    return [{ device, fstype, totalBytes: Number(total), usedBytes: Number(used), freeBytes: Number(free), path }];
  });

/**
 * Mounts worth offering: real filesystems outside the system directories, once each
 */
export const candidateMounts = (mounts: DfMount[]): DfMount[] => {
  const seen = new Set<string>();
  return mounts
    .filter((mount) => !VIRTUAL_FS.has(mount.fstype) && !isSystemPath(mount.path) && mount.totalBytes > 0)
    .filter((mount) => !seen.has(mount.path) && seen.add(mount.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
};

const SNAPRAID_FILE = /\.(parity|content)$|^snapraid\.\d?-?parity$/;

/**
 * What is on a mount point: whether it is empty (apart from lost+found), and SnapRAID files of
 * an existing array on it. Bind-mounted files (/etc/hosts in Docker) are no candidates.
 */
export const inspectMount = async (mount: DfMount): Promise<MountCandidate | null> => {
  try {
    if (!(await Deno.stat(mount.path)).isDirectory) return null;
    let entries = 0;
    const snapraidFiles: string[] = [];
    for await (const entry of Deno.readDir(mount.path)) {
      if (entry.name === "lost+found") continue;
      entries++;
      if (entry.isFile && SNAPRAID_FILE.test(entry.name)) snapraidFiles.push(entry.name);
    }
    return { ...mount, empty: entries === 0, snapraidFiles };
  } catch {
    return null;
  }
};

export const listMountCandidates = async (): Promise<MountCandidate[]> => {
  const { code, stdout } = await new Deno.Command("df", {
    args: ["-B1", "--output=source,fstype,size,used,avail,target"],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (code !== 0 && stdout.length === 0) return [];
  const candidates = await Promise.all(candidateMounts(parseDfMounts(new TextDecoder().decode(stdout))).map(inspectMount));
  return candidates.filter((candidate) => candidate !== null);
};

const isFile = async (path: string) => {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
};

const isDirectory = async (path: string) => {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
};

/**
 * Mount points of a setup that are no directories, e.g. a disk that is not mounted into the container
 */
export const missingSetupPaths = async (arraySetup: ArraySetup): Promise<string[]> => {
  const paths = [...arraySetup.dataDisks.map((disk) => disk.path), ...arraySetup.parityPaths];
  const missing = [];
  for (const path of paths) if (!(await isDirectory(path))) missing.push(path);
  return missing;
};

export type CreateArrayResult =
  | { ok: true; path: string }
  | { ok: false; status: 400 | 409 | 500; error: string; problems?: SetupProblem[]; missing?: string[]; exists?: boolean };

/**
 * Write the snapraid.conf of a new array into the data directory and add it to the arrays.
 * fileName is checked by the caller; an existing file is never overwritten.
 */
export const createArray = async (name: string, fileName: string, arraySetup: ArraySetup): Promise<CreateArrayResult> => {
  const problems = setupProblems(arraySetup);
  if (problems.length > 0) {
    return { ok: false, status: 400, error: msg("server_error_setup_invalid", { problems: problems.join(", ") }), problems };
  }
  const missing = await missingSetupPaths(arraySetup);
  if (missing.length > 0) {
    return { ok: false, status: 400, error: msg("server_error_setup_missing", { paths: missing.join(", ") }), missing };
  }

  const storedPath = fileName.endsWith(".conf") ? fileName : `${fileName}.conf`;
  const configName = storedPath.replace(/\.conf$/, "");
  try {
    await Deno.writeTextFile(resolveFromBase(storedPath), buildSnapraidConf(arraySetup, BASE_PATH, configName), {
      createNew: true,
    });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return {
        ok: false,
        status: 409,
        error: msg("server_error_file_exists", { path: resolveFromBase(storedPath) }),
        exists: true,
      };
    }
    return { ok: false, status: 500, error: String(error) };
  }

  const appConfig = await loadAppConfig();
  // The entry the first start created for a snapraid.conf that was never put there
  const placeholders = await Promise.all(
    appConfig.snapraidConfigs.map(async (entry) =>
      entry.name === "Default" && entry.path === "snapraid.conf" && !(await isFile(resolveFromBase(entry.path)))
    ),
  );
  appConfig.snapraidConfigs = appConfig.snapraidConfigs.filter((_, index) => !placeholders[index]);
  appConfig.snapraidConfigs.push({ name: name.trim(), path: storedPath, enabled: true });
  await saveAppConfig(appConfig);
  return { ok: true, path: storedPath };
};
