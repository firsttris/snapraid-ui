import { getEngine } from "./engine/engine.ts";

// WebSocket connection management
const wsClients = new Set<WebSocket>();

export const broadcast = (message: unknown): void => {
  const data = JSON.stringify(message);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

export const handleWebSocketUpgrade = (req: Request): Response => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    wsClients.add(socket);
    // A client connecting mid-job (reload, reconnect) gets the output so far, before any new chunk
    const engine = getEngine();
    const job = engine.currentJob();
    if (job) {
      socket.send(JSON.stringify({
        type: "replay",
        command: job.command,
        processId: job.processId,
        output: engine.currentOutput(),
      }));
    }
  };

  socket.onclose = () => {
    wsClients.delete(socket);
  };

  socket.onerror = (error: Event | ErrorEvent) => {
    //console.error("WebSocket error:", error);
    wsClients.delete(socket);
  };

  return response;
}
