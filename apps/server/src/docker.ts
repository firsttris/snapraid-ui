// Minimal client for the Docker Engine API over its unix socket.
// HTTP/1.0 keeps the responses simple: no chunked encoding, the connection closes after each.
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import type { DockerContainer } from "@shared/types.ts";
import { DEMO_MODE, demoDocker } from "./demo.ts";

const TIMEOUT_MS = 15_000;

export interface DockerResponse {
  status: number;
  body: string;
}

export type DockerRequest = (method: "GET" | "POST", path: string) => Promise<DockerResponse>;

// Everything the socket sends until it closes; the timeout destroys it, which fails the request
const exchange = (socketPath: string, request: string): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(socketPath, () => socket.write(request));
    const timer = setTimeout(
      () => socket.destroy(new Error(`The Docker socket did not answer within ${TIMEOUT_MS / 1000} s`)),
      TIMEOUT_MS,
    );
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", (hadError) => {
      clearTimeout(timer);
      if (!hadError) resolve(new Uint8Array(Buffer.concat(chunks)));
    });
  });

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
 * Requests against the Docker socket at the given path; the demo has containers of its own
 */
export const dockerSocket = (socketPath: string): DockerRequest => DEMO_MODE ? demoDocker : unixSocket(socketPath);

const unixSocket = (socketPath: string): DockerRequest => async (method, path) => {
  const request = `${method} ${path} HTTP/1.0\r\nHost: docker\r\nContent-Length: 0\r\n\r\n`;
  return parseHttpResponse(new TextDecoder().decode(await exchange(socketPath, request)));
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
 * Id of the container from /proc/self/mountinfo: Docker and Podman mount the container's hostname
 * file (`.../containers/<id>/hostname`) at /etc/hostname. Only that mount counts: on a host that
 * runs containers, mountinfo also lists their mounts (`.../containers/<id>/mounts/shm`)
 */
export const containerIdFromMountinfo = (mountinfo: string): string | null => {
  for (const line of mountinfo.split("\n")) {
    // id parent major:minor root mountpoint ...
    const [, , , root, mountPoint] = line.split(" ");
    if (mountPoint !== "/etc/hostname") continue;
    const id = root?.match(/containers\/([0-9a-f]{64})\//)?.[1];
    if (id) return id;
  }
  return null;
};

/**
 * Id of the container this process runs in; null outside a container
 */
export const ownContainerId = async (): Promise<string | null> => {
  try {
    return containerIdFromMountinfo(await readFile("/proc/self/mountinfo", "utf8"));
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
