import { dirname } from "@std/path";
import type {
  DataDiskUsage,
  ParityFileUsage,
  ParityLevelUsage,
  ParsedSnapRaidConfig,
} from "@shared/types.ts";
import { type FsUsage, parseDfOutput } from "./parsers/df-parser.ts";
import { DEMO_MODE, demoDataDiskUsage, demoParityUsage } from "./demo.ts";

const toGB = (bytes: number): number => Math.round(bytes / 1e9 * 10) / 10;

const getFsUsage = async (path: string): Promise<FsUsage | null> => {
  try {
    const { code, stdout } = await new Deno.Command("df", {
      args: ["-B1", "--output=size,avail,target", "--", path],
      stdout: "piped",
      stderr: "null",
    }).output();
    return code === 0 ? parseDfOutput(new TextDecoder().decode(stdout)) : null;
  } catch {
    return null;
  }
};

const getFileSize = async (path: string): Promise<number | null> => {
  try {
    return (await Deno.stat(path)).size;
  } catch {
    return null;
  }
};

const getFileUsage = async (path: string) => {
  // The directory exists before the first sync creates the parity file
  const [size, fs] = await Promise.all([getFileSize(path), getFsUsage(dirname(path))]);
  return { size, fs };
};

/**
 * Size of each parity file and the free space next to it. Split parity files may share a
 * filesystem, so its free space is counted once per level.
 */
export const getParityUsage = (config: ParsedSnapRaidConfig): Promise<ParityLevelUsage[]> =>
  DEMO_MODE ? Promise.resolve(demoParityUsage(config)) : Promise.all(config.parity.map(async ({ level, keyword, paths }) => {
    const usages = await Promise.all(paths.map(getFileUsage));

    const files: ParityFileUsage[] = usages.map(({ size, fs }, index) => ({
      path: paths[index],
      fileSizeGB: size === null ? null : toGB(size),
      mount: fs?.mount ?? null,
      diskTotalGB: fs ? toGB(fs.totalBytes) : null,
      diskFreeGB: fs ? toGB(fs.freeBytes) : null,
    }));

    const filesystems = usages.map(({ fs }) => fs);
    const capacityBytes = filesystems.every((fs) => fs !== null)
      ? usages.reduce((sum, { size }) => sum + (size ?? 0), 0) +
        [...new Map(filesystems.map((fs) => [fs!.mount, fs!.freeBytes])).values()]
          .reduce((sum, free) => sum + free, 0)
      : null;

    return { level, keyword, files, capacityGB: capacityBytes === null ? null : toGB(capacityBytes) };
  }));

/**
 * Size and free space of the filesystem behind each data disk
 */
export const getDataDiskUsage = (config: ParsedSnapRaidConfig): Promise<DataDiskUsage[]> =>
  DEMO_MODE ? Promise.resolve(demoDataDiskUsage(config)) : Promise.all(Object.entries(config.data).map(async ([name, path]) => {
    const fs = await getFsUsage(path);
    return {
      name,
      totalGB: fs ? toGB(fs.totalBytes) : null,
      freeGB: fs ? toGB(fs.freeBytes) : null,
    };
  }));
