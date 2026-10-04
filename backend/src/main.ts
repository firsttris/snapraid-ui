import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadAppConfig } from "./config-parser.ts";
import { broadcast, handleWebSocketUpgrade } from "./websocket.ts";
import { setProgressListener } from "./executors/command-executor.ts";
import { setBroadcast } from "./routes/snapraid.ts";
import { createLogManager } from "./log-manager.ts";
import { setLogManager } from "./routes/logs.ts";
import { createScheduler } from "./scheduler.ts";
import { setScheduler } from "./routes/schedules.ts";
import { configRoutes } from "./routes/config.ts";
import { filesystemRoutes } from "./routes/filesystem.ts";
import { snapraidRoutes } from "./routes/snapraid.ts";
import { logsRoutes } from "./routes/logs.ts";
import { schedulesRoutes } from "./routes/schedules.ts";
import { notificationsRoutes } from "./routes/notifications.ts";
import { resolveFromBase } from "./config.ts";
import { createAuth, disabledAuthRoutes, loadSessionSecret, readAuthEnv } from "./auth.ts";

const app = new Hono();

// Middleware
// Credentials (the session cookie) are only accepted from the same host, e.g. the dev frontend on :3000
app.use("*", cors({
  origin: (origin, c) => {
    try {
      return new URL(origin).hostname === new URL(c.req.url).hostname ? origin : null;
    } catch {
      return null;
    }
  },
  credentials: true,
}));

// Login, enabled by SNAPRAID_UI_USERNAME and SNAPRAID_UI_PASSWORD
const authEnv = readAuthEnv();
if (authEnv) {
  const auth = createAuth({
    ...authEnv,
    secret: await loadSessionSecret(authEnv.username, authEnv.password),
  });
  // Registered before all other routes, so it guards them including the WebSocket
  app.use("/api/*", auth.middleware);
  app.use("/ws", auth.middleware);
  app.route("/api/auth", auth.routes);
  console.log(`🔒 Login enabled for user "${authEnv.username}"`);
} else {
  app.route("/api/auth", disabledAuthRoutes);
  console.warn("⚠️  Login disabled: set SNAPRAID_UI_USERNAME and SNAPRAID_UI_PASSWORD to protect the UI");
}

// WebSocket endpoint (must be handled before Hono routes)
app.get("/ws", (c) => {
  return handleWebSocketUpgrade(c.req.raw);
});

// API Routes
app.route("/api/config", configRoutes);
app.route("/api/filesystem", filesystemRoutes);
app.route("/api/snapraid", snapraidRoutes);
app.route("/api/logs", logsRoutes);
app.route("/api/schedules", schedulesRoutes);
app.route("/api/notifications", notificationsRoutes);

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", service: "SnapRAID Backend" });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

const main = async (): Promise<void> => {
  const config = await loadAppConfig();

  // Use environment variables with config fallback
  const host = "0.0.0.0";
  const port = 8080;

  // Initialize log manager
  const logManager = createLogManager(resolveFromBase(config.logs.directory));
  await logManager.ensureLogDirectory();

  // Inject broadcast function into snapraid routes
  setBroadcast(broadcast);

  // Inject log manager into routes
  setLogManager(logManager, config);

  // Set log manager for snapraid runner
  const { setRunnerLogManager, getRunner } = await import("./routes/snapraid.ts");
  setRunnerLogManager(logManager);
  // Progress comes from the job's log, not its output, so it is sent on its own
  setProgressListener((job, progress) =>
    broadcast({ type: "progress", command: job.command, processId: job.processId, progress })
  );

  // Initialize scheduler
  const schedulesConfigPath = resolveFromBase("schedules.json");
  const runner = getRunner();
  // Report the end of scheduled jobs like manual ones, so clients stop showing them as running
  const scheduler = createScheduler(schedulesConfigPath, {
    ...runner,
    executeCommand: async (command, ...rest) => {
      try {
        const result = await runner.executeCommand(command, ...rest);
        broadcast({
          type: "complete",
          command,
          processId: runner.getLastJob()?.processId,
          forceOption: runner.getLastJob()?.forceOption,
          exitCode: result.exitCode,
          aborted: result.aborted,
          timestamp: result.timestamp,
        });
        return result;
      } catch (error) {
        broadcast({ type: "error", command, processId: runner.getLastJob()?.processId, error: String(error), timestamp: new Date().toISOString() });
        throw error;
      }
    },
  });
  
  // Set output callback for scheduled jobs
  scheduler.setOutputCallback((scheduleId, chunk) => {
    broadcast({
      type: "output",
      command: "scheduled",
      chunk: `[Schedule: ${scheduleId}] ${chunk}`,
      timestamp: new Date().toISOString(),
    });
  });

  // Load schedules
  try {
    await scheduler.loadSchedules();
  } catch (error) {
    console.error("Failed to initialize scheduler:", error);
  }

  // Inject scheduler into routes
  setScheduler(scheduler);

  // Perform initial log rotation
  await logManager.rotateLogs(
    config.logs.maxFiles,
    config.logs.maxAge
  );

  console.log(`🚀 Starting SnapRAID Backend on http://${host}:${port}`);
  console.log(`📝 Logs directory: ${config.logs.directory}`);

  Deno.serve({
    hostname: host,
    port,
    handler: app.fetch,
  });
};

main();
