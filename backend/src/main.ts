import { Hono } from "hono";
import { cors } from "hono/cors";
import { ConfigParser } from "./config-parser.ts";
import { broadcast, handleWebSocketUpgrade } from "./websocket.ts";
import { setBroadcast } from "./routes/snapraid.ts";
import { LogManager } from "./log-manager.ts";
import { setLogManager } from "./routes/logs.ts";
import configRoutes from "./routes/config.ts";
import filesystemRoutes from "./routes/filesystem.ts";
import snapraidRoutes from "./routes/snapraid.ts";
import logsRoutes from "./routes/logs.ts";

const app = new Hono();

// Middleware
app.use("*", cors());

// WebSocket endpoint (must be handled before Hono routes)
app.get("/ws", (c) => {
  return handleWebSocketUpgrade(c.req.raw);
});

// API Routes
app.route("/api/config", configRoutes);
app.route("/api/filesystem", filesystemRoutes);
app.route("/api/snapraid", snapraidRoutes);
app.route("/api/logs", logsRoutes);

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", service: "SnapRAID Backend" });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});
async function main() {
  const config = await ConfigParser.loadAppConfig();
  const { host, port } = config.backend;

  // Initialize log manager
  const logManager = new LogManager(config.logs.directory);
  await logManager.ensureLogDirectory();

  // Inject broadcast function into snapraid routes
  setBroadcast(broadcast);

  // Inject log manager into routes
  setLogManager(logManager, config);

  // Set log manager for snapraid runner
  const { setRunnerLogManager } = await import("./routes/snapraid.ts");
  setRunnerLogManager(logManager);

  // Perform initial log rotation
  const deleted = await logManager.rotateLogs(
    config.logs.maxFiles,
    config.logs.maxAge
  );
  if (deleted > 0) {
    console.log(`🗑️  Rotated ${deleted} old log file(s)`);
  }

  console.log(`🚀 Starting SnapRAID Backend on http://${host}:${port}`);
  console.log(`📝 Logs directory: ${config.logs.directory}`);
  console.log(`🚀 Starting SnapRAID Backend on http://${host}:${port}`);

  Deno.serve({
    hostname: host,
    port,
    handler: app.fetch,
  });
}

main();
