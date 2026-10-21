import { AsyncLocalStorage } from 'node:async_hooks'
import handler from '@tanstack/react-start/server-entry'
import { overwriteServerAsyncLocalStorage } from './paraglide/runtime'
import { paraglideMiddleware } from './paraglide/server'

// Paraglide would import the bare "async_hooks" on the first request, which Deno (the backend
// that runs this server) does not resolve without the node: prefix
overwriteServerAsyncLocalStorage(new AsyncLocalStorage())

// Resolve the locale from the request (cookie, else Accept-Language) during SSR, so the server renders
// the same language as the client and hydration does not fail after switching
export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
