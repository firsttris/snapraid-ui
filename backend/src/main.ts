import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadAppConfig } from "./config-parser.ts";
import { broadcast, handleWebSocketUpgrade } from "./websocket.ts";
import { setBroadcast, setSnapraidLogManager } from "./routes/snapraid.ts";
import { activeEngine, type SnapRaidEngine, setEngine, wrapJobs } from "./engine/engine.ts";
import { createCliEngine } from "./engine/cli-engine.ts";
import { buildEngine, loadEngineSettings } from "./engine/engine-settings.ts";
import { engineRoutes, setEngineApplier } from "./routes/engine.ts";
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
import { maintenanceRoutes, setSpindownMonitor } from "./routes/maintenance.ts";
import { metricsRoutes, setMetricsSources } from "./routes/metrics.ts";
import { setupRoutes } from "./routes/setup.ts";
import { createSpindownMonitor } from "./spindown.ts";
import { resumeLeftoverContainers } from "./container-pause.ts";
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
app.route("/api/maintenance", maintenanceRoutes);
app.route("/api/metrics", metricsRoutes);
app.route("/api/setup", setupRoutes);
app.route("/api/engine", engineRoutes);

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
  const port = Number(Deno.env.get("PORT") ?? 8080);

  // Initialize log manager
  const logManager = createLogManager(resolveFromBase(config.logs.directory));
  await logManager.ensureLogDirectory();

  // Inject broadcast function into snapraid routes
  setBroadcast(broadcast);

  // Inject log manager into routes
  setLogManager(logManager, config);

  // The SnapRAID CLI runs the jobs and reads the array, or snapraid-daemon for the config it serves
  const cli = createCliEngine(logManager);
  setSnapraidLogManager(logManager);
  const applyEngine = (next: SnapRaidEngine) => {
    // Progress comes from the job's log or the daemon's task, not its output, so it is sent on its own
    next.onProgress((job, progress) =>
      broadcast({ type: "progress", command: job.command, processId: job.processId, progress })
    );
    setEngine(next);
  };
  const engineSettings = await loadEngineSettings();
  applyEngine(buildEngine(engineSettings, cli));
  setEngineApplier((settings) => applyEngine(buildEngine(settings, cli)));
  if (engineSettings.mode === "daemon") {
    engineSettings.daemons.forEach((target) => console.log(`🧩 snapraid-daemon at ${target.url} runs ${target.configPath}`));
  }
  // Scheduler and spindown keep this one, it always passes on to the engine in place
  const engine = activeEngine;

  // Initialize scheduler
  const schedulesConfigPath = resolveFromBase("schedules.json");
  // Report the end of scheduled jobs like manual ones, so clients stop showing them as running
  const scheduler = createScheduler(
    schedulesConfigPath,
    wrapJobs(engine, async (request, runJob) => {
      const { command } = request;
      try {
        const outcome = await runJob(request);
        broadcast({
          type: "complete",
          command,
          processId: engine.lastJob()?.processId,
          forceOption: engine.lastJob()?.forceOption,
          exitCode: outcome.output.exitCode,
          aborted: outcome.output.aborted,
          timestamp: outcome.output.timestamp,
        });
        return outcome;
      } catch (error) {
        broadcast({ type: "error", command, processId: engine.lastJob()?.processId, error: String(error), timestamp: new Date().toISOString() });
        throw error;
      }
    }),
  );
  
  // Set output callback for scheduled jobs
  setMetricsSources(logManager, () => scheduler.getSchedules());
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

  // Containers paused for a job that was cut off by a restart
  await resumeLeftoverContainers();

  // Spins idle disks down when enabled in the settings. `snapraid down` takes SnapRAID's lock,
  // so it waits while a job runs and shortly before a scheduled one would start
  const SPINDOWN_SCHEDULE_MARGIN_MS = 2 * 60_000;
  const spindown = createSpindownMonitor(() =>
    !!engine.currentJob() ||
    [...scheduler.getNextRuns().values()].some((next) =>
      next !== null && next.getTime() - Date.now() < SPINDOWN_SCHEDULE_MARGIN_MS
    )
  );
  setSpindownMonitor(spindown);
  spindown.start();

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
