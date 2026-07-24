import type { Messages } from '../i18n/messages'
import type { ProjectApiError } from './projectApi'

/**
 * The text a component should render for a `ProjectApiError`.
 *
 * Failures the client detected itself carry a `CLIENT_*` code and are mapped
 * through the active locale's dictionary; anything else keeps the message the
 * server provided, which this client never rewrites.
 */
export function apiErrorMessage(error: ProjectApiError, t: Messages): string {
  const { code } = error
  if (code !== null && code in t.projects.apiErrors) {
    return t.projects.apiErrors[code as keyof Messages['projects']['apiErrors']]
  }
  return error.message
}
