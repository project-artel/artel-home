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
 * Registers the single listener notified when a call is rejected with 401 that
 * refreshing could not rescue. Access tokens expire after 15 minutes, but the
 * refresh cookie renews them silently, so reaching this handler means the
 * session itself is over and the app must return to the login boundary.
 */
export function setUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * Trades the refresh cookie for a fresh access cookie. Resolves to whether a
 * retry is worth attempting; the cookies themselves never reach this code.
 *
 * A page renders several panels at once, so an expired access token produces a
 * burst of simultaneous 401s. They share one call: without that, each panel
 * would refresh on its own and the later responses would race to overwrite the
 * cookie the earlier ones just installed.
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${orchestrationUrl}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

/**
 * Performs a credentialed call against the orchestration server. Every
 * authenticated request must go through here so session expiry is handled in
 * one place. `getCurrentUser` deliberately bypasses it: a 401 there means
 * "not signed in yet", not "the session just expired".
 *
 * A 401 is retried once behind a refresh. Only once: if the retry is rejected
 * as well, the refresh cookie is gone or expired too, and retrying again would
 * loop against a session that is genuinely over.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const send = () => fetch(`${orchestrationUrl}${path}`, {
    ...init,
    credentials: 'include',
  })

  let response = await send()

  if (response.status === 401 && await refreshSession()) {
    response = await send()
  }

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
  const send = () => fetch(`${orchestrationUrl}/api/auth/me`, {
    credentials: 'include',
    signal,
  })

  let response = await send()

  // A reload after the 15-minute access token expired still has a valid refresh
  // cookie. Without this the app would send the user back to login every time.
  if (response.status === 401 && await refreshSession()) {
    response = await send()
  }

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

/**
 * Issues the one-time code the SDK trades for its own token.
 *
 * The browser session is the only credential this call carries: `apiFetch`
 * sends the cookie, and the SDK proves later that it is the process that
 * started the flow by presenting the verifier behind `codeChallenge`. That is
 * why the code may travel back over plain loopback HTTP — on its own it is
 * useless to anyone who intercepts it.
 */
export async function createSdkLoginCode(codeChallenge: string): Promise<string> {
  const response = await apiFetch('/api/auth/sdk/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codeChallenge }),
  })

  if (!response.ok) {
    throw new Error('Unable to issue an SDK login code')
  }

  const data: unknown = await response.json()
  const code = (data as Record<string, unknown> | null)?.code

  if (typeof code !== 'string' || code.length === 0) {
    throw new Error('The server did not return an SDK login code')
  }

  return code
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
