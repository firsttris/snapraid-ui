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
    console.log("WebSocket client connected");
    wsClients.add(socket);
  };

  socket.onclose = () => {
    console.log("WebSocket client disconnected");
    wsClients.delete(socket);
  };

  socket.onerror = (error: Event | ErrorEvent) => {
    console.error("WebSocket error:", error);
    wsClients.delete(socket);
  };

  return response;
}
