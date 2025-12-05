import { ConfigParser } from "./config-parser.ts";
import { SnapRaidRunner } from "./snapraid-runner.ts";
import type { CommandOutput } from "./types.ts";

const runner = new SnapRaidRunner();
const commandHistory: CommandOutput[] = [];
const MAX_HISTORY = 50;

// WebSocket connections
const wsClients = new Set<WebSocket>();

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // WebSocket upgrade
  if (url.pathname === "/ws") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
      console.log("WebSocket client connected");
      wsClients.add(socket);
    };

    socket.onclose = () => {
      console.log("WebSocket client disconnected");
      wsClients.delete(socket);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      wsClients.delete(socket);
    };

    return response;
  }

  // API Routes
  if (url.pathname === "/api/config") {
    if (req.method === "GET") {
      const config = await ConfigParser.loadAppConfig();
      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (req.method === "POST") {
      const config = await req.json();
      await ConfigParser.saveAppConfig(config);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (url.pathname === "/api/snapraid/parse") {
    const configPath = url.searchParams.get("path");
    if (!configPath) {
      return new Response(JSON.stringify({ error: "Missing path parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const parsed = await ConfigParser.parseSnapRaidConfig(configPath);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (url.pathname === "/api/snapraid/execute" && req.method === "POST") {
    const body = await req.json();
    const { command, configPath, args = [] } = body;

    if (!command || !configPath) {
      return new Response(
        JSON.stringify({ error: "Missing command or configPath" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Execute command and stream output via WebSocket
    runner.executeCommand(
      command,
      configPath,
      (chunk) => {
        broadcast({
          type: "output",
          command,
          chunk,
          timestamp: new Date().toISOString(),
        });
      },
      args
    ).then((result) => {
      // Add to history
      commandHistory.unshift(result);
      if (commandHistory.length > MAX_HISTORY) {
        commandHistory.pop();
      }

      // Send completion message
      broadcast({
        type: "complete",
        command,
        exitCode: result.exitCode,
        timestamp: result.timestamp.toISOString(),
      });

      // Parse status if it was a status command
      if (command === "status") {
        const status = SnapRaidRunner.parseStatusOutput(result.output);
        broadcast({
          type: "status",
          status,
        });
      }
    }).catch((error) => {
      broadcast({
        type: "error",
        command,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    });

    return new Response(
      JSON.stringify({ success: true, message: "Command started" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (url.pathname === "/api/history") {
    return new Response(JSON.stringify(commandHistory), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}

async function main() {
  const config = await ConfigParser.loadAppConfig();
  const { host, port } = config.backend;

  console.log(`Starting SnapRAID Backend on http://${host}:${port}`);
  
  Deno.serve({
    hostname: host,
    port,
    handler: handleRequest,
  });
}

main();
