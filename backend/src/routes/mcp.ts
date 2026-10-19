import { Hono } from "hono";
// @ts-types="@modelcontextprotocol/sdk/server/webStandardStreamableHttp"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { safeEqual } from "../auth.ts";
import { snapshotConfigs } from "../array-snapshot.ts";
import { loadAppConfig, parseSnapRaidConfig } from "../config-parser.ts";
import { BASE_PATH, resolveFromBase } from "../config.ts";
import { getEngine } from "../engine/engine.ts";
import type { LogManager } from "../log-manager.ts";
import { loadMaintenanceSettings } from "../maintenance-settings.ts";
import { createMcpServer, DOCS_DIR } from "../mcp.ts";
import type { Scheduler } from "../scheduler.ts";
import { createArray, listMountCandidates, missingSetupPaths } from "../setup.ts";
import { rememberStatus } from "../status-cache.ts";
import { getUsageHistory, recordUsage } from "../usage-history.ts";
import { startExternalJob } from "./snapraid.ts";

// Log manager and scheduler will be injected
const state = {
  logManager: null as LogManager | null,
  scheduler: null as Scheduler | null,
};

export const setMcpSources = (logManager: LogManager, scheduler: Scheduler): void => {
  state.logManager = logManager;
  state.scheduler = scheduler;
};

/**
 * POST /api/mcp - MCP over Streamable HTTP for AI agents, stateless with JSON responses. The login
 * does not apply: off unless enabled under Automation, and always with its own token
 */
export const createMcpRoutes = (loadSettings = loadMaintenanceSettings) =>
  new Hono().all("/", async (c) => {
    const { mcp: settings } = await loadSettings();
    if (!settings.enabled) return c.json({ error: "The MCP endpoint is disabled" }, 404);
    const sent = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
    if (!settings.token || !(await safeEqual(sent, settings.token))) {
      c.header("WWW-Authenticate", 'Bearer realm="snapraid-ui"');
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!state.logManager || !state.scheduler) return c.json({ error: "Not initialized" }, 503);
    const { logManager, scheduler } = state;

    const server = await createMcpServer({
      version: Deno.env.get("SNAPRAID_UI_VERSION") ?? "",
      allowActions: settings.allowActions,
      engine: getEngine,
      arrays: async () => (await loadAppConfig()).snapraidConfigs,
      resolvePath: resolveFromBase,
      dataDir: BASE_PATH,
      snapshot: snapshotConfigs,
      usageHistory: getUsageHistory,
      readStatus: async (configPath) => {
        const { status, exitCode } = await getEngine().readStatus(configPath);
        if (exitCode === 0) {
          await recordUsage(configPath, status);
          rememberStatus(configPath, status);
        }
        return { status, exitCode };
      },
      parseConfig: parseSnapRaidConfig,
      logManager,
      scheduler,
      runCommand: (configPath, command) => startExternalJob(configPath, command, `AI agent ${command}`),
      listMounts: listMountCandidates,
      missingPaths: missingSetupPaths,
      createArray,
      docsDir: DOCS_DIR,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });

export const mcpRoutes = createMcpRoutes();
