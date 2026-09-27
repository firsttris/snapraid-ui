import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server'

// Resolve the locale from the request (cookie) during SSR, so the server renders
// the same language as the client and hydration does not fail after switching
export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
