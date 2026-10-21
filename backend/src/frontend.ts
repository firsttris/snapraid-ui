// The built frontend: TanStack Start, built by Nitro with the "standard" preset into one fetch
// handler for the server-side rendering and the static files. The backend serves it on its own
// port next to /api and /ws, so the UI runs as a single process without a proxy in front.

export type FetchHandler = (request: Request) => Response | Promise<Response>;

// Next to the backend as in the repository and the Docker image: frontend/.output/server/index.mjs
export const FRONTEND_ENTRY = new URL("../../frontend/.output/server/index.mjs", import.meta.url);

// The backend's own paths, never passed on to the frontend
export const isBackendPath = (path: string): boolean => /^\/(api|ws)(\/|$)/.test(path);

/**
 * The frontend's fetch handler, or null when it was not built (development runs the Vite dev server)
 */
export const loadFrontend = async (entry: URL = FRONTEND_ENTRY): Promise<FetchHandler | null> => {
  try {
    await Deno.stat(entry);
  } catch {
    return null;
  }
  const module = await import(entry.href);
  const handler = module.default?.fetch;
  if (typeof handler !== "function") throw new Error(`${entry.pathname} exports no fetch handler`);
  return handler;
};
