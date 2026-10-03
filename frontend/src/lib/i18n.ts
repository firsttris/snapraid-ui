import { localize, type MsgInputs } from '@shared/i18n'
import * as m from '../paraglide/messages'

const messages = m as unknown as Record<
  string,
  ((inputs: MsgInputs) => string) | undefined
>

/**
 * Renders the messages the backend sends as keys (msg() in shared/i18n.ts)
 * in the language of the UI. Plain text passes through unchanged.
 */
export const localizeServer = (text: string): string =>
  localize(text, (key, inputs) => messages[key]?.(inputs))
