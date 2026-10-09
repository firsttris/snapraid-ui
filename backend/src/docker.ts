// Minimal client for the Docker Engine API over its unix socket.
// HTTP/1.0 keeps the responses simple: no chunked encoding, the connection closes after each.
import type { DockerContainer } from "@shared/types.ts";

const TIMEOUT_MS = 15_000;

export interface DockerResponse {
  status: number;
  body: string;
}

export type DockerRequest = (method: "GET" | "POST", path: string) => Promise<DockerResponse>;

const readAll = async (conn: Deno.Conn): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(16 * 1024);
  while (true) {
    const read = await conn.read(buffer);
    if (read === null) break;
    chunks.push(buffer.slice(0, read));
  }
  const total = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    total.set(chunk, offset);
    offset += chunk.length;
  });
  return total;
};

/**
 * Status and body of a raw HTTP/1.x response
 */
export const parseHttpResponse = (raw: string): DockerResponse => {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const head = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
  const status = parseInt(head.match(/^HTTP\/\d\.\d (\d{3})/)?.[1] ?? "", 10);
  if (Number.isNaN(status)) throw new Error("Invalid response from the Docker socket");
  return { status, body: headerEnd === -1 ? "" : raw.slice(headerEnd + 4) };
};

/**
 * Requests against the Docker socket at the given path
 */
export const dockerSocket = (socketPath: string): DockerRequest => async (method, path) => {
  const conn = await Deno.connect({ transport: "unix", path: socketPath });
  const timer = setTimeout(() => conn.close(), TIMEOUT_MS);
  try {
    const request = `${method} ${path} HTTP/1.0\r\nHost: docker\r\nContent-Length: 0\r\n\r\n`;
    await conn.write(new TextEncoder().encode(request));
    return parseHttpResponse(new TextDecoder().decode(await readAll(conn)));
  } finally {
    clearTimeout(timer);
    try {
      conn.close();
    } catch {
      // Closed by the timeout
    }
  }
};

const errorOf = ({ status, body }: DockerResponse): Error => {
  let message = body.trim();
  try {
    message = JSON.parse(body).message ?? message;
  } catch {
    // Plain text
  }
  return new Error(`Docker API ${status}${message ? `: ${message}` : ""}`);
};

interface ApiContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
}

/**
 * Id of the container this process runs in, from the hostname file Docker and Podman mount
 * (`.../containers/<id>/hostname`); null outside a container
 */
export const ownContainerId = async (): Promise<string | null> => {
  try {
    const mounts = await Deno.readTextFile("/proc/self/mountinfo");
    return mounts.match(/containers\/([0-9a-f]{64})\//)?.[1] ?? null;
  } catch {
    return null;
  }
};

export const listContainers = async (
  request: DockerRequest,
  ownId: string | null = null,
): Promise<DockerContainer[]> => {
  const response = await request("GET", "/containers/json?all=true");
  if (response.status !== 200) throw errorOf(response);
  return (JSON.parse(response.body) as ApiContainer[])
    .map((container) => ({
      id: container.Id,
      // Names start with a slash, e.g. "/nextcloud"
      name: (container.Names[0] ?? container.Id.slice(0, 12)).replace(/^\//, ""),
      image: container.Image,
      state: container.State,
      ...(container.Id === ownId ? { self: true } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const inspectContainer = async (
  request: DockerRequest,
  name: string,
): Promise<{ id: string; state: string }> => {
  const response = await request("GET", `/containers/${encodeURIComponent(name)}/json`);
  if (response.status !== 200) throw errorOf(response);
  const { Id, State } = JSON.parse(response.body) as { Id: string; State: { Status: string } };
  return { id: Id, state: State.Status };
};

export const pauseContainer = async (request: DockerRequest, name: string): Promise<void> => {
  const response = await request("POST", `/containers/${encodeURIComponent(name)}/pause`);
  if (response.status !== 204) throw errorOf(response);
};

export const unpauseContainer = async (request: DockerRequest, name: string): Promise<void> => {
  const response = await request("POST", `/containers/${encodeURIComponent(name)}/unpause`);
  if (response.status !== 204) throw errorOf(response);
};
