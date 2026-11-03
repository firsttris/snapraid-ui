import * as m from '../../paraglide/messages'
import { localizeServer } from '../i18n'

/**
 * The error of a failed request: the backend's message in the language of
 * the UI, or the HTTP status when the backend sent none.
 */
export const apiError = async (response: Response): Promise<Error> => {
  const body = await response.json().catch(() => ({}))
  return new Error(
    typeof body.error === 'string' && body.error
      ? localizeServer(body.error)
      : m.common_request_failed({ status: response.status }),
  )
}
