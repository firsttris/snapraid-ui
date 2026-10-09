import { Hono } from "hono";
import type { ReplacementStep, SnapRaidCommand } from "@shared/types.ts";
import { resolveFromBase } from "../config.ts";
import {
  applyReplacementPath,
  clearReplacement,
  DiskReplacementError,
  getReplacement,
  recordReplacementStep,
  requiredDirectory,
  saveReplacement,
} from "../disk-replacement.ts";
import type { JobOutcome } from "../engine/engine.ts";
import { msg } from "@shared/i18n.ts";

type StartJob = (
  command: SnapRaidCommand,
  configPath: string,
  args: string[],
  afterRun?: (outcome: JobOutcome) => Promise<void>,
) => void;

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
};

const STEP_ARGS: Record<ReplacementStep, (diskName: string) => { command: SnapRaidCommand; args: string[] }> = {
  fix: (diskName) => ({ command: "fix", args: ["-d", diskName] }),
  // -a verifies the recovered files against their hashes, without reading parity
  check: (diskName) => ({ command: "check", args: ["-a", "-d", diskName] }),
  sync: () => ({ command: "sync", args: [] }),
};

/**
 * Routes for replacing a failed disk, see disk-replacement.ts.
 * Each step runs as a regular job, its result is stored once SnapRAID exits.
 */
export const createDiskReplacementRoutes = ({ startJob, isBusy }: { startJob: StartJob; isBusy: () => boolean }) => {
  const routes = new Hono();

  const runStep = (configPath: string, diskName: string, step: ReplacementStep) => {
    const { command, args } = STEP_ARGS[step](diskName);
    startJob(command, resolveFromBase(configPath), args, async ({ report }) => {
      await recordReplacementStep(configPath, step, {
        result: report.result,
        finishedAt: new Date().toISOString(),
        recovered: report.recovered,
        unrecoverable: report.unrecoverable,
        errors: report.ioErrors + report.dataErrors,
        logFile: report.logFile,
      });
    });
  };

  // GET /api/snapraid/replace-disk?path= - Replacement in progress for a config, or null
  routes.get("/replace-disk", async (c) => {
    const configPath = c.req.query("path");
    if (!configPath) return c.json({ error: "Missing path parameter" }, 400);
    return c.json(await getReplacement(configPath));
  });

  // POST /api/snapraid/replace-disk - Point the disk to its new location and start `fix -d`
  routes.post("/replace-disk", async (c) => {
    const { configPath, diskName, newPath } = await c.req.json();
    if (!configPath || !diskName || !newPath?.trim()) {
      return c.json({ error: "Missing configPath, diskName or newPath" }, 400);
    }
    if (isBusy()) return c.json({ error: msg("server_error_job_running") }, 409);

    const existing = await getReplacement(configPath);
    if (existing && !existing.completedAt && existing.diskName !== diskName) {
      return c.json({ error: msg("server_error_replacement_running", { disk: existing.diskName }) }, 409);
    }

    try {
      const path = resolveFromBase(configPath);
      const { config, diskType, oldPath } = applyReplacementPath(
        await Deno.readTextFile(path),
        diskName,
        newPath.trim(),
      );
      const directory = requiredDirectory(diskType, newPath.trim());
      if (!(await isDirectory(directory))) {
        return c.json({ error: msg("server_error_not_a_directory", { path: directory }) }, 400);
      }
      await Deno.writeTextFile(path, config);

      // Restarting the same disk keeps its original path, the config already points to the new one
      const resumed = existing && existing.diskName === diskName && !existing.completedAt ? existing : null;
      const replacement = {
        configPath,
        diskName,
        diskType,
        oldPath: resumed?.oldPath ?? oldPath,
        newPath: newPath.trim(),
        startedAt: new Date().toISOString(),
        steps: {},
      };
      await saveReplacement(replacement);
      runStep(configPath, diskName, "fix");
      return c.json(replacement);
    } catch (error) {
      if (error instanceof DiskReplacementError) return c.json({ error: error.message }, 400);
      return c.json({ error: String(error) }, 500);
    }
  });

  // POST /api/snapraid/replace-disk/step - Run fix again, the check or the final sync
  routes.post("/replace-disk/step", async (c) => {
    const { configPath, step } = await c.req.json<{ configPath: string; step: ReplacementStep }>();
    if (!configPath || !(step in STEP_ARGS)) return c.json({ error: "Missing configPath or step" }, 400);
    if (isBusy()) return c.json({ error: msg("server_error_job_running") }, 409);

    const replacement = await getReplacement(configPath);
    if (!replacement) return c.json({ error: msg("server_error_no_replacement") }, 404);
    if (step !== "fix" && !replacement.steps.fix) {
      return c.json({ error: msg("server_error_run_fix_first") }, 400);
    }
    if (step === "check" && replacement.diskType === "parity") {
      return c.json({ error: msg("server_error_check_data_disks_only") }, 400);
    }

    runStep(configPath, replacement.diskName, step);
    return c.json({ success: true });
  });

  // DELETE /api/snapraid/replace-disk?path= - Close a finished replacement or give up; the config keeps the new path
  routes.delete("/replace-disk", async (c) => {
    const configPath = c.req.query("path");
    if (!configPath) return c.json({ error: "Missing path parameter" }, 400);
    await clearReplacement(configPath);
    return c.json({ success: true });
  });

  return routes;
};
