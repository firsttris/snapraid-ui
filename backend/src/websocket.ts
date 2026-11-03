import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { getEngine } from "./engine/engine.ts";

// WebSocket connection management
const wsClients = new Set<ServerWebSocket<undefined>>();

export const broadcast = (message: unknown): void => {
  const data = JSON.stringify(message);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

/**
 * Closes every connection, e.g. after a new password: the UI connects again with its session, a
 * session that ended gets 401
 */
export const closeAllClients = (): void => {
  wsClients.forEach((client) => client.close(1000, "Session ended"));
  wsClients.clear();
};

/**
 * The connections' events, for Bun.serve's `websocket` next to the fetch handler
 */
export const websocket: WebSocketHandler<undefined> = {
  open(socket) {
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
  },
  // Clients only listen
  message() {},
  // Also after an error
  close(socket) {
    wsClients.delete(socket);
  },
};

/**
 * Upgrades the request to a WebSocket on the server that received it (the env of Hono's fetch)
 */
export const handleWebSocketUpgrade = (req: Request, server: Server<undefined>): Response => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 400 });
  }
  // A request that is no valid upgrade fails
  if (!server.upgrade(req, { data: undefined })) throw new TypeError("Invalid WebSocket upgrade request");
  // Bun answers the upgrade itself and ignores this response
  return new Response(null);
};
