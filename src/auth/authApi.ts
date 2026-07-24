import { isLocale, type Locale } from '../i18n/locale'
import type { AuthUser, LinkedIdentity } from './authTypes'

const orchestrationUrl = (import.meta.env.VITE_ORCHESTRATION_URL ?? 'http://localhost:8080').replace(/\/$/, '')

/**
 * The absolute URL of an orchestration path.
 *
 * `apiFetch` covers everything that goes through `fetch`. This exists for the
 * two callers that cannot: an OAuth redirect the browser performs itself, and
 * `EventSource`, which is given a URL and opens the connection on its own.
 */
export function orchestrationUrlFor(path: string): string {
  return `${orchestrationUrl}${path}`
}

export function getOAuthLoginUrl(path: string): string {
  return orchestrationUrlFor(path)
}

export class UnauthorizedError extends Error {
  constructor() {
    super('The session is no longer valid')
    this.name = 'UnauthorizedError'
  }
}

let unauthorizedHandler: (() => void) | null = null

/**
 * Registers the single listener notified when any authenticated call is
 * rejected with 401. Access tokens expire after 15 minutes, so expiry during
 * an active session is routine and must return the app to the login boundary.
 */
export function setUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

/**
 * Performs a credentialed call against the orchestration server. Every
 * authenticated request must go through here so session expiry is handled in
 * one place. `getCurrentUser` deliberately bypasses it: a 401 there means
 * "not signed in yet", not "the session just expired".
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${orchestrationUrl}${path}`, {
    ...init,
    credentials: 'include',
  })

  if (response.status === 401) {
    unauthorizedHandler?.()
    throw new UnauthorizedError()
  }

  return response
}

function parseLinkedIdentity(data: unknown): LinkedIdentity | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const { provider, login, displayName, avatarUrl } = data as Record<string, unknown>

  if (typeof provider !== 'string' || typeof login !== 'string' || typeof displayName !== 'string') {
    return null
  }

  return {
    provider,
    login,
    displayName,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
  }
}

/**
 * Only `id` and `displayName` are required, because those are what the shell
 * renders. Every other field degrades to a safe default: a session that is
 * otherwise valid must never be rejected over a cosmetic field, which would
 * bounce the user back to the login screen with no way forward.
 */
function parseAuthUser(data: unknown): AuthUser {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Malformed session payload')
  }

  const { id, displayName, email, locale, identities } = data as Record<string, unknown>

  if (typeof id !== 'string' || typeof displayName !== 'string') {
    throw new Error('Malformed session payload')
  }

  return {
    id,
    displayName,
    email: typeof email === 'string' ? email : null,
    // A locale the client has no translations for degrades to "never chosen".
    locale: isLocale(locale) ? locale : null,
    identities: Array.isArray(identities)
      ? identities
          .map(parseLinkedIdentity)
          .filter((identity): identity is LinkedIdentity => identity !== null)
      : [],
  }
}

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch(`${orchestrationUrl}/api/auth/me`, {
    credentials: 'include',
    signal,
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to check the current session')
  }

  return parseAuthUser(await response.json())
}

/**
 * Persists the language choice on the account so it follows the user across
 * browsers. Callers treat failure as non-fatal: the switch already happened
 * locally, and the next sign-in simply falls back to the previous value.
 */
export async function updateMyLocale(locale: Locale): Promise<void> {
  const response = await apiFetch('/api/auth/me/locale', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  })

  if (!response.ok) {
    throw new Error('Unable to save the language preference')
  }
}

export async function endSession(): Promise<void> {
  const response = await fetch(`${orchestrationUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok && response.status !== 401) {
    throw new Error('Unable to end the current session')
  }
}
