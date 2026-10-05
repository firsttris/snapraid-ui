import { localize, type MsgInputs } from '@shared/i18n'

type Message = (inputs: MsgInputs) => string

// The backend only sends server_* keys (msg() in shared/i18n.ts). Importing
// just those message modules, instead of looking keys up on the whole
// `import * as m` namespace, keeps the other messages tree-shakable: a lookup
// by a runtime key pulled every message in all locales into the entry bundle.
const messages: Record<string, Message | undefined> = Object.assign(
  {},
  ...Object.values(
    import.meta.glob<Record<string, Message>>(
      '../paraglide/messages/server_*.js',
      { eager: true },
    ),
  ),
)

/**
 * Renders the messages the backend sends as keys (msg() in shared/i18n.ts)
 * in the language of the UI. Plain text passes through unchanged.
 */
export const localizeServer = (text: string): string =>
  localize(text, (key, inputs) => messages[key]?.(inputs))
