// MCP server for AI agents (Claude, Cursor, ...): tools that read the state of the arrays, the
// logs and the schedules, and, unless turned off, start and stop jobs, change schedules and
// create arrays; the documentation of SnapRAID UI as resources, so an agent answers "how do I"
// questions from it. Built fresh for every request (stateless), see routes/mcp.ts.
import { basename, fromFileUrl, join } from "@std/path";
// The SDK's exports map `./*.js` to types it doesn't have; @ts-types points Deno at the right ones
// @ts-types="@modelcontextprotocol/sdk/server/mcp"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// @ts-types="@modelcontextprotocol/sdk/types"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type ArraySetup, buildSnapraidConf, setupProblems } from "@shared/array-setup.ts";
import { localize } from "@shared/i18n.ts";
import type {
  LogFile,
  ParsedSnapRaidConfig,
  Schedule,
  SnapRaidConfig,
  SnapRaidStatus,
  UsagePoint,
} from "@shared/types.ts";
import { diskFreeSeries, forecastFill } from "@shared/usage-forecast.ts";
import { arrayState } from "./home-assistant.ts";
import type { ConfigMetrics } from "./metrics.ts";
import { EngineBusyError, type SnapRaidEngine } from "./engine/engine.ts";
import type { LogManager } from "./log-manager.ts";
import type { Scheduler } from "./scheduler.ts";
import type { CreateArrayResult } from "./setup.ts";

export const DOCS_DIR = fromFileUrl(new URL("../../docs/", import.meta.url));

export interface McpDeps {
  version: string;
  allowActions: boolean;
  engine: () => SnapRaidEngine;
  arrays: () => Promise<SnapRaidConfig[]>;
  resolvePath: (path: string) => string;
  dataDir: string;
  snapshot: () => Promise<ConfigMetrics[]>;
  usageHistory: (configPath: string) => Promise<UsagePoint[]>;
  // Reads the status with SnapRAID and remembers it for the snapshot
  readStatus: (configPath: string) => Promise<{ status: SnapRaidStatus; exitCode: number | null }>;
  parseConfig: (configPath: string) => Promise<ParsedSnapRaidConfig>;
  logManager: Pick<LogManager, "listLogs" | "readLog">;
  scheduler: Pick<Scheduler, "getSchedules" | "getNextRuns" | "runNow" | "updateSchedule">;
  // sync through the sync guard, or scrub with the default plan; throws when it can't start
  runCommand: (configPath: string, command: "sync" | "scrub") => Promise<void>;
  listMounts: () => Promise<unknown[]>;
  missingPaths: (setup: ArraySetup) => Promise<string[]>;
  createArray: (name: string, fileName: string, setup: ArraySetup) => Promise<CreateArrayResult>;
  docsDir: string;
}

const INSTRUCTIONS = `SnapRAID UI manages SnapRAID arrays on this server: parity protection for data disks, run as
jobs (sync, scrub, ...), schedules, SMART health and notifications.

- Start with get_overview: health, last sync and scrub, disk usage, temperatures and the running
  job. It uses what SnapRAID UI already knows and never wakes a disk. read_status and get_changes
  run SnapRAID, which reads the content file and can spin disks up.
- For "how do I" questions (setting up an array, replacing a disk, schedules, errors) read the
  documentation with read_documentation first and combine it with the real state of the server.
- To set up a new array: list_mounts, propose which disk is parity (at least as large as the
  largest data disk), check it with check_array_setup, then create_array once the user agreed.
- Only one job runs at a time. Before start_job, abort_job, run_schedule, update_schedule or
  create_array, tell the user what will happen and get their agreement. A sync can take hours.
- Repairs (fix, restore of files, replacing a disk) are done in the web UI, which guides through
  them; point the user there.`;

type Json = Record<string, unknown> | unknown[];

const ok = (data: Json | string): CallToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

// Messages meant for the web UI arrive as keys, see shared/i18n.ts; an agent gets the key and inputs
const plain = (text: string) =>
  localize(text, (key, inputs) => Object.keys(inputs).length ? `${key} (${JSON.stringify(inputs)})` : key);

const errorText = (error: unknown) => plain(error instanceof Error ? error.message : String(error));

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ACTION = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const arrayArg = z.string().optional().describe(
  "Name of the array as list_arrays shows it; may be left out when there is only one",
);

// Status without the raw output and the chart data, which only fill the context
const compactStatus = (status: SnapRaidStatus) => {
  const { rawOutput: _raw, scrubHistory: _history, ...rest } = status;
  return rest;
};

const docPages = async (docsDir: string) => {
  const pages: { page: string; title: string }[] = [];
  try {
    for await (const entry of Deno.readDir(docsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const text = await Deno.readTextFile(join(docsDir, entry.name));
      const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? entry.name;
      pages.push({ page: entry.name.replace(/\.md$/, ""), title });
    }
  } catch {
    // No documentation shipped, e.g. a backend run outside the repository
  }
  return pages.sort((a, b) => a.page === "README" ? -1 : b.page === "README" ? 1 : a.page.localeCompare(b.page));
};

const readDocPage = async (docsDir: string, page: string): Promise<string | null> => {
  const name = page.replace(/\.md$/, "");
  if (!/^[\w-]+$/.test(name)) return null;
  try {
    return await Deno.readTextFile(join(docsDir, `${name}.md`));
  } catch {
    return null;
  }
};

const tail = (text: string, lines: number) => {
  const all = text.split("\n");
  return all.length <= lines ? text : [`… ${all.length - lines} earlier lines left out`, ...all.slice(-lines)].join("\n");
};

export const createMcpServer = async (deps: McpDeps): Promise<McpServer> => {
  const server = new McpServer({ name: "snapraid-ui", version: deps.version || "dev" }, { instructions: INSTRUCTIONS });

  const enabledArrays = async () => (await deps.arrays()).filter((array) => array.enabled);

  // The array a tool is about, by name; the only one when it is left out
  const pickArray = async (name?: string): Promise<{ array: SnapRaidConfig; path: string } | string> => {
    const arrays = await enabledArrays();
    if (arrays.length === 0) return "No array is set up yet. Use list_mounts and create_array to set one up.";
    const wanted = name?.trim().toLowerCase();
    const array = wanted
      ? arrays.find((a) => a.name.toLowerCase() === wanted || a.path.toLowerCase() === wanted)
      : arrays.length === 1
      ? arrays[0]
      : undefined;
    if (!array) {
      const names = arrays.map((a) => `"${a.name}"`).join(", ");
      return wanted ? `No array "${name}". The arrays: ${names}` : `There are several arrays, pass one of: ${names}`;
    }
    return { array, path: deps.resolvePath(array.path) };
  };

  const nameOf = async (configPath: string) =>
    (await deps.arrays()).find((a) => deps.resolvePath(a.path) === configPath)?.name ?? configPath;

  const describeJob = async () => {
    const engine = deps.engine();
    const job = engine.currentJob();
    const last = engine.lastJob();
    return {
      running: job
        ? {
          command: job.command,
          array: await nameOf(job.configPath),
          startedAt: job.startTime,
          aborting: job.aborting ?? false,
          progress: job.progress,
        }
        : null,
      lastFinished: last
        ? {
          command: last.command,
          finishedAt: last.finishedAt,
          exitCode: last.exitCode,
          aborted: last.aborted,
          error: last.error && plain(last.error),
          forceOption: last.forceOption,
        }
        : null,
    };
  };

  // ---- Reading ----

  server.registerTool("list_arrays", {
    title: "List arrays",
    description: "The SnapRAID arrays of SnapRAID UI with their data and parity disks.",
    annotations: READ_ONLY,
  }, async () => {
    const arrays = await deps.arrays();
    return ok(await Promise.all(arrays.map(async (array) => {
      try {
        const { data, parity } = await deps.parseConfig(deps.resolvePath(array.path));
        return { name: array.name, configFile: array.path, enabled: array.enabled, dataDisks: data, parity };
      } catch (error) {
        return { name: array.name, configFile: array.path, enabled: array.enabled, error: errorText(error) };
      }
    })));
  });

  server.registerTool("get_overview", {
    title: "Array overview",
    description:
      "Health, last sync and scrub, bad blocks, scrub coverage, usage and fill forecast, temperatures and SMART " +
      "counters per disk, and the running job. From what SnapRAID UI already knows: never wakes a disk. " +
      "The status part is missing until the status was read once since SnapRAID UI started (read_status).",
    inputSchema: { array: arrayArg },
    annotations: READ_ONLY,
  }, async ({ array }) => {
    const job = deps.engine().currentJob();
    let configs = await deps.snapshot();
    if (array) {
      const picked = await pickArray(array);
      if (typeof picked === "string") return fail(picked);
      configs = configs.filter((config) => config.path === picked.path);
    }
    const arrays = await Promise.all(configs.map(async (config) => {
      const history = await deps.usageHistory(config.path).catch(() => []);
      const disks = Object.keys(config.usage?.disks ?? {});
      return {
        name: config.name,
        ...arrayState(config, job),
        statusReadAt: config.status?.timestamp ?? null,
        status: config.status ? compactStatus(config.status.status) : null,
        usage: config.usage ?? null,
        fillForecast: Object.fromEntries(disks.map((disk) => [disk, forecastFill(diskFreeSeries(history, disk)) ?? null])),
        smart: config.smart,
        lastRuns: config.lastRuns,
      };
    }));
    return ok({ arrays, job: await describeJob() });
  });

  server.registerTool("read_status", {
    title: "Read status",
    description:
      "Runs `snapraid status` for an array: parity up to date, files changed since the last sync, bad blocks, " +
      "scrub age, space per disk, disks that are missing or empty. Reads the content file, which can wake a disk.",
    inputSchema: { array: arrayArg },
    annotations: READ_ONLY,
  }, async ({ array }) => {
    const picked = await pickArray(array);
    if (typeof picked === "string") return fail(picked);
    try {
      const { status, exitCode } = await deps.readStatus(picked.path);
      return ok({ array: picked.array.name, exitCode, status: compactStatus(status) });
    } catch (error) {
      if (error instanceof EngineBusyError) {
        return fail(error.reason === "job" ? "A job is running, read the status once it finished (get_job)" : error.message);
      }
      return fail(errorText(error));
    }
  });

  server.registerTool("get_changes", {
    title: "Changes since the last sync",
    description:
      "Runs `snapraid diff`: counts of new, changed, deleted, moved files since the last sync and a sample of them. " +
      "Use before a sync to see whether it looks right; many deleted or changed files can mean a missing disk or " +
      "ransomware. Can wake disks.",
    inputSchema: {
      array: arrayArg,
      limit: z.number().int().min(0).max(500).optional().describe("Files to list, default 50"),
    },
    annotations: READ_ONLY,
  }, async ({ array, limit }) => {
    const picked = await pickArray(array);
    if (typeof picked === "string") return fail(picked);
    if (deps.engine().currentJob()) return fail("A job is running, look at the changes once it finished (get_job)");
    try {
      const { files, rawOutput: _raw, ...counts } = await deps.engine().readDiff(picked.path);
      const changed = files.filter((file) => file.status !== "equal");
      return ok({
        array: picked.array.name,
        ...counts,
        files: changed.slice(0, limit ?? 50),
        filesLeftOut: Math.max(0, changed.length - (limit ?? 50)),
      });
    } catch (error) {
      return fail(errorText(error));
    }
  });

  server.registerTool("get_job", {
    title: "Running and last job",
    description: "The running job with its progress, and how the last job ended. Poll it after start_job.",
    annotations: READ_ONLY,
  }, async () => ok(await describeJob()));

  server.registerTool("list_logs", {
    title: "List logs",
    description: "The logs of past runs, newest first, with their result (ok, warning, error, aborted, incomplete).",
    inputSchema: {
      array: arrayArg,
      command: z.string().optional().describe("Only runs of this command, e.g. sync, scrub, smart"),
      limit: z.number().int().min(1).max(200).optional().describe("Default 20"),
    },
    annotations: READ_ONLY,
  }, async ({ array, command, limit }) => {
    let logs: LogFile[] = await deps.logManager.listLogs();
    if (array) {
      const picked = await pickArray(array);
      if (typeof picked === "string") return fail(picked);
      logs = logs.filter((log) => !log.configPath || log.configPath === picked.path);
    }
    if (command) logs = logs.filter((log) => log.command === command);
    return ok(
      logs
        .toSorted((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit ?? 20)
        .map(({ filename, command, timestamp, modified, result, size }) => ({
          filename,
          command,
          startedAt: timestamp,
          finishedAt: modified,
          result,
          size,
        })),
    );
  });

  server.registerTool("read_log", {
    title: "Read a log",
    description: "The end of a log from list_logs: SnapRAID's output and errors of that run.",
    inputSchema: {
      filename: z.string().describe("As list_logs shows it"),
      lines: z.number().int().min(10).max(2000).optional().describe("Last lines to return, default 200"),
    },
    annotations: READ_ONLY,
  }, async ({ filename, lines }) => {
    if (basename(filename) !== filename) return fail("Pass the file name as list_logs shows it");
    const known = (await deps.logManager.listLogs()).some((log) => log.filename === filename);
    if (!known) return fail(`No log "${filename}", see list_logs`);
    try {
      return ok(tail(await deps.logManager.readLog(filename), lines ?? 200));
    } catch (error) {
      return fail(errorText(error));
    }
  });

  server.registerTool("list_schedules", {
    title: "List schedules",
    description:
      "The schedules with their command, cron expression, next and last run, last outcome, sync guard limits " +
      "and whether the next run is skipped.",
    annotations: READ_ONLY,
  }, async () => {
    const nextRuns = deps.scheduler.getNextRuns();
    const schedules: Schedule[] = await deps.scheduler.getSchedules();
    return ok(await Promise.all(schedules.map(async (schedule) => ({
      id: schedule.id,
      name: schedule.name,
      command: schedule.command,
      array: await nameOf(deps.resolvePath(schedule.configPath)),
      cronExpression: schedule.cronExpression,
      enabled: schedule.enabled,
      skipNext: schedule.skipNext ?? false,
      nextRun: nextRuns.get(schedule.id)?.toISOString() ?? null,
      lastRun: schedule.lastRun ?? null,
      lastOutcome: schedule.lastOutcome ?? null,
      touchBefore: schedule.touchBefore ?? false,
      scrubAfter: schedule.scrubAfter ?? null,
      maxDeletedFiles: schedule.maxDeletedFiles ?? null,
      maxUpdatedFiles: schedule.maxUpdatedFiles ?? null,
    }))));
  });

  server.registerTool("list_mounts", {
    title: "List mounted disks",
    description:
      "Mounted filesystems that can become disks of a new array, with size, used and free bytes, whether they " +
      "are empty and SnapRAID files of an existing array on them. In Docker only the disks mounted into the container.",
    annotations: READ_ONLY,
  }, async () => {
    try {
      return ok(await deps.listMounts());
    } catch (error) {
      return fail(errorText(error));
    }
  });

  const setupShape = {
    dataDisks: z.array(z.object({
      name: z.string().describe("d1, d2, ..."),
      path: z.string().describe("Absolute mount point"),
    })).describe("The data disks"),
    parityPaths: z.array(z.string()).describe("Mount points of the parity disks, level 1 first; each at least as large as the largest data disk"),
  };

  server.registerTool("check_array_setup", {
    title: "Check a new array",
    description:
      "Checks a planned array (data disks and parity) without writing anything and shows the snapraid.conf " +
      "create_array would write.",
    inputSchema: { name: z.string().optional().describe("Name of the array, for the preview"), ...setupShape },
    annotations: READ_ONLY,
  }, async ({ name, dataDisks, parityPaths }) => {
    const setup = { dataDisks, parityPaths };
    const problems = setupProblems(setup);
    const missing = problems.length === 0 ? await deps.missingPaths(setup) : [];
    return ok({
      valid: problems.length === 0 && missing.length === 0,
      problems,
      missingPaths: missing,
      config: problems.length === 0 ? buildSnapraidConf(setup, deps.dataDir, fileNameOf(name ?? "snapraid")) : null,
    });
  });

  server.registerTool("read_documentation", {
    title: "Read the documentation",
    description:
      "The documentation of SnapRAID UI: without a page the list of pages, with one its text. Covers installation, " +
      "configuration, usage, disks (add, replace, remove), scheduling, notifications, SMART, logs, automation, " +
      "security and troubleshooting.",
    inputSchema: { page: z.string().optional().describe("Page as the list shows it, e.g. disks") },
    annotations: READ_ONLY,
  }, async ({ page }) => {
    if (!page) return ok(await docPages(deps.docsDir));
    const text = await readDocPage(deps.docsDir, page);
    return text === null ? fail(`No page "${page}", call read_documentation without a page for the list`) : ok(text);
  });

  // ---- Actions ----

  if (deps.allowActions) {
    server.registerTool("start_job", {
      title: "Start sync or scrub",
      description:
        "Starts a sync or scrub of an array in the background and returns at once; follow it with get_job. " +
        "A sync is skipped when diff reports more than 50 deleted or 100 changed files (sync guard), look at " +
        "get_changes and use the web UI to sync anyway. A scrub checks the default share of the array.",
      inputSchema: { array: arrayArg, command: z.enum(["sync", "scrub"]) },
      annotations: ACTION,
    }, async ({ array, command }) => {
      const picked = await pickArray(array);
      if (typeof picked === "string") return fail(picked);
      try {
        await deps.runCommand(picked.path, command);
        return ok(`${command} of "${picked.array.name}" started. Follow it with get_job.`);
      } catch (error) {
        return fail(errorText(error));
      }
    });

    server.registerTool("abort_job", {
      title: "Abort the running job",
      description: "Asks the running job to stop. SnapRAID saves its state first; a sync can be continued later.",
      annotations: { ...ACTION, destructiveHint: true },
    }, () => {
      const engine = deps.engine();
      const job = engine.currentJob();
      if (!job) return fail("No job is running");
      return engine.abortJob(job.processId) ? ok(`Aborting ${job.command}`) : fail("The job could not be aborted");
    });

    server.registerTool("run_schedule", {
      title: "Run a schedule now",
      description: "Runs a schedule once, now, with its routine and sync guard, like its timed runs.",
      inputSchema: { scheduleId: z.string().describe("id from list_schedules") },
      annotations: ACTION,
    }, async ({ scheduleId }) => {
      try {
        await deps.scheduler.runNow(scheduleId);
        return ok("The schedule started. Follow it with get_job.");
      } catch (error) {
        return fail(errorText(error));
      }
    });

    server.registerTool("update_schedule", {
      title: "Pause or skip a schedule",
      description: "Turns a schedule on or off, or skips its next timed run once.",
      inputSchema: {
        scheduleId: z.string().describe("id from list_schedules"),
        enabled: z.boolean().optional(),
        skipNext: z.boolean().optional().describe("true skips the next timed run once"),
      },
      annotations: { ...ACTION, idempotentHint: true },
    }, async ({ scheduleId, enabled, skipNext }) => {
      if (enabled === undefined && skipNext === undefined) return fail("Pass enabled or skipNext");
      try {
        const updated = await deps.scheduler.updateSchedule(scheduleId, {
          ...(enabled !== undefined ? { enabled } : {}),
          ...(skipNext !== undefined ? { skipNext } : {}),
        });
        return ok({ id: updated.id, name: updated.name, enabled: updated.enabled, skipNext: updated.skipNext ?? false });
      } catch (error) {
        return fail(errorText(error));
      }
    });

    server.registerTool("create_array", {
      title: "Create an array",
      description:
        "Writes the snapraid.conf of a new array (as check_array_setup shows it) into the data directory and adds " +
        "the array. Nothing is synced yet: the first sync builds the parity and takes hours. Never overwrites a file.",
      inputSchema: { name: z.string().min(1).describe("Name shown in the UI, e.g. Media"), ...setupShape },
      annotations: ACTION,
    }, async ({ name, dataDisks, parityPaths }) => {
      const result = await deps.createArray(name, `${fileNameOf(name)}.conf`, { dataDisks, parityPaths });
      if (result.ok) return ok(`Array "${name}" created (${result.path}). Start the first sync with start_job when the user wants.`);
      if (result.problems) return fail(`The setup is invalid: ${result.problems.join(", ")}`);
      if (result.missing) return fail(`Not a directory: ${result.missing.join(", ")}`);
      if (result.exists) return fail(`${fileNameOf(name)}.conf exists already, pick another name`);
      return fail(plain(result.error));
    });
  }

  // ---- Documentation as resources, for clients that let the user attach them ----

  for (const { page, title } of await docPages(deps.docsDir)) {
    server.registerResource(`docs-${page}`, `docs://snapraid-ui/${page}`, {
      title,
      mimeType: "text/markdown",
    }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: (await readDocPage(deps.docsDir, page)) ?? "" }],
    }));
  }

  return server;
};

// File name of an array's config from its name: "Media Server" -> "media-server"
export const fileNameOf = (name: string) =>
  name.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "array";
